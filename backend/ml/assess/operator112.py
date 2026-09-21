"""Оценщик режима A (специалист-112, FR-036): карточка, заполненная по аудиозаписи, против билета.

Вход — `attempt` (OperatorAttempt контракта: openedAt, answeredAt, completedAt, events, replays, hintsShown,
cardSnapshot = CardDraft) и `ticket` (IncidentCard: group, summary, address, caller, victims, noAmbulance,
expectedTags, expectedServices). Эталон — сам билет и строки ЕКП группы; правила — `rules.OP_*` с источниками.

Компоненты (веса `DEFAULT_WEIGHTS_OPERATOR112`): answer_timing (a), final_type (b: тип + список оповещения),
address (c), description_facts (d), signs_flags (e), applicant_phone (f), grammar (g); activity (h) — число
прослушиваний и подсказок, информационно (вес 0). `fieldDiff` — сравнение «моя карточка ↔ эталон» (FR-040).
Детерминирован при одинаковом входе; без эмбеддера факты и признаки сверяются лексически (`available=false`).
"""

from __future__ import annotations

import re
from typing import Any

from rapidfuzz import fuzz

from ml.assess import rules
from ml.assess.components import clamp01, parse_ms, to_sec
from ml.assess.components.address import SCORES as ADDRESS_SCORES
from ml.assess.types import (
    DEFAULT_WEIGHTS_OPERATOR112,
    MODE_OPERATOR112,
    AssessmentResult,
    AssessOptions,
    ComponentResult,
)
from ml.classify import notification_list as nl
from ml.nlp import address as address_nlp
from ml.nlp import grammar as grammar_nlp
from ml.nlp import semantic

ASSESSOR_VERSION = "operator112-1.0.0"
COMPONENT_NAMES = ("answer_timing", "final_type", "address", "description_facts", "signs_flags", "applicant_phone", "grammar", "activity")
# Решение команды (по аналогии с режимом B): неверный итоговый тип — карточка ушла не тем службам; итог ≤ 0,5.
FINAL_TYPE_CAP = 0.5
DEFAULT_ANSWER_MS = 30_000
DEFAULT_SUBMIT_MS = 180_000
DEFAULT_MAX_GRAMMAR_ERRORS = 1
# Порог близости для коротких фактов выше общего (0,70): «дом газифицирован» ↔ «запах газа» даёт ≈0,72 на rubert-tiny2,
# а перефразировка «в доме газ» — ≈0,84 (решение команды по результатам T077).
FACT_THRESHOLD = 0.80
SIGN_MATCH_RATIO = 80
NAME_MATCH_RATIO = 85
UNKNOWN_NAMES = ("не указан", "не указано", "себе", "неизвестно", "аноним", "")
FACT_SPLIT = re.compile(r"[;.]\s*|,\s*(?=[а-яёА-ЯЁ])")
MIN_FACT_CHARS = 4
_DIGITS = re.compile(r"\D+")


# ─── Вход ─────────────────────────────────────────────────────────────────────────────────────────


def draft_of(attempt: dict[str, Any]) -> dict[str, Any]:
    return dict(attempt.get("cardSnapshot") or attempt.get("draft") or {})


def _get(data: dict[str, Any], *path: str, default: Any = None) -> Any:
    node: Any = data
    for key in path:
        if not isinstance(node, dict):
            return default
        node = node.get(key)
    return default if node is None else node


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def draft_signs(draft: dict[str, Any]) -> list[str]:
    return [str(s) for s in (_get(draft, "what", "signs", default=[]) or []) if str(s).strip()]


def draft_flags(draft: dict[str, Any]) -> list[str]:
    """Флаги карточки в терминах условий классификатора: casualties → «Пострадавшие», flags[] как есть."""
    flags = [str(f) for f in (_get(draft, "what", "flags", default=[]) or []) if str(f).strip()]
    casualties = _get(draft, "what", "casualties", default={}) or {}
    if casualties.get("injured"):
        flags.append("Пострадавшие")
    if casualties.get("blocked"):
        flags.append("НД")
    return flags


def ticket_facts(ticket: dict[str, Any]) -> list[str]:
    """Обязательные факты билета: фрагменты фабулы + примечание о пострадавших (сверяются по смыслу)."""
    facts: list[str] = []
    seen: set[str] = set()
    note = _text((ticket.get("victims") or {}).get("note")) if isinstance(ticket.get("victims"), dict) else ""
    for part in [*FACT_SPLIT.split(str(ticket.get("summary") or "")), note]:
        fact = part.strip(" ,;.")
        if len(fact) >= MIN_FACT_CHARS and nl.norm(fact) not in seen:
            seen.add(nl.norm(fact))
            facts.append(fact)
    return facts


def normalize_phone(value: Any) -> str:
    digits = _DIGITS.sub("", str(value or ""))
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    return digits


def _norms(options: AssessOptions | None, params: dict[str, Any] | None) -> tuple[int, int, int]:
    norms = (params or {}).get("norms") or {}
    answer = norms.get("answerSec") or norms.get("primaryReactionSec")
    submit = norms.get("submitSec") or norms.get("fullProcessingSec")
    limit = (params or {}).get("maxGrammarErrors")
    answer_ms = int(answer * 1000) if isinstance(answer, (int, float)) and answer > 0 else DEFAULT_ANSWER_MS
    submit_ms = int(submit * 1000) if isinstance(submit, (int, float)) and submit > 0 else DEFAULT_SUBMIT_MS
    grammar_limit = int(limit) if isinstance(limit, (int, float)) and not isinstance(limit, bool) and limit >= 0 else DEFAULT_MAX_GRAMMAR_ERRORS
    return answer_ms, submit_ms, grammar_limit


# ─── Компоненты ───────────────────────────────────────────────────────────────────────────────────


def answer_timing(attempt: dict[str, Any], answer_norm_ms: int, submit_norm_ms: int) -> ComponentResult:
    result = ComponentResult(name="answer_timing", score=1.0)
    opened = parse_ms(attempt.get("openedAt"))
    answered = parse_ms(attempt.get("answeredAt"))
    completed = parse_ms(attempt.get("completedAt"))
    answer_ms = (answered - opened) if opened is not None and answered is not None else None
    submit_ms = (completed - answered) if answered is not None and completed is not None else None
    score = 0.0
    if answer_ms is None:
        result.errors.append(rules.OP_NOT_ANSWERED.error(step="answer"))
    elif answer_ms > answer_norm_ms:
        result.errors.append(rules.OP_ANSWER_TIMEOUT.error(step="answer", fact=to_sec(answer_ms), norm=to_sec(answer_norm_ms)))
        score += 0.5 * answer_norm_ms / answer_ms
    else:
        score += 0.5
    if submit_ms is None:
        result.errors.append(rules.OP_NOT_SUBMITTED.error(step="submit"))
    elif submit_ms > submit_norm_ms:
        result.errors.append(rules.OP_PROCESSING.error(step="submit", fact=to_sec(submit_ms), norm=to_sec(submit_norm_ms)))
        score += 0.5 * submit_norm_ms / submit_ms
    else:
        score += 0.5
    result.score = clamp01(score)
    result.details = {"answerMs": answer_ms, "submitMs": submit_ms, "normAnswerMs": answer_norm_ms, "normSubmitMs": submit_norm_ms}
    return result


def final_type(draft: dict[str, Any], ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any]) -> ComponentResult:
    """Итоговый тип (строка ЕКП по коду/признакам/названию) против группы билета; список оповещения против expectedServices."""
    result = ComponentResult(name="final_type", score=1.0)
    expected_group = str(ticket.get("group") or "")
    expected_ids = nl.expected_service_ids(list(ticket.get("expectedServices") or []), reference)
    chosen = nl.build(entries, reference, signs=draft_signs(draft), classifier_code=_text(_get(draft, "what", "classifierCode")), final_type=_text(_get(draft, "what", "finalType")), flags=draft_flags(draft))
    entered_ids = [str(item.get("serviceId") or "") for item in (draft.get("notificationList") or []) if isinstance(item, dict)]
    if not entered_ids and chosen.entry is not None:
        entered_ids = chosen.service_ids  # список не передан — считаем автоматический по выбранному типу
    missing_ids = [sid for sid in expected_ids if sid not in entered_ids]
    missing_titles = [nl.service_title(sid, reference) for sid in missing_ids]
    actual_title = chosen.final_type or _text(_get(draft, "what", "finalType"))
    result.details = {"expectedGroup": expected_group, "actualGroup": chosen.group, "actualFinalType": actual_title, "classifierCode": chosen.classifier_code, "expectedServices": expected_ids, "enteredServices": entered_ids, "missingServices": missing_ids}
    if chosen.entry is None:
        result.errors.append(rules.OP_NO_FINAL_TYPE.error(step="field:what.finalType", expected=expected_group))
        result.score = 0.0
        return result
    if nl.norm(chosen.group) != nl.norm(expected_group):
        suffix = f"; в списке оповещения нет служб: {', '.join(missing_titles)}" if missing_titles else ""
        result.errors.append(rules.OP_WRONG_FINAL_TYPE.error(step="field:what.finalType", actual=actual_title, expected=expected_group, missing=suffix))
        result.score = 0.0
        return result
    if missing_titles:
        result.errors.append(rules.OP_MISSING_SERVICE.error(step="field:notificationList", services=", ".join(missing_titles)))
        result.score = clamp01(1.0 - 0.5 * len(missing_ids) / max(1, len(expected_ids)))
    return result


def address(draft: dict[str, Any], ticket: dict[str, Any]) -> ComponentResult:
    """Адрес по справочнику улиц (Q&A): та же улица / похожая / опечатка / другая; фиксация «из справочника / вручную»."""
    result = ComponentResult(name="address", score=1.0)
    block = draft.get("address") if isinstance(draft.get("address"), dict) else {}
    entered = _text(block.get("street")) or _text(block.get("formal")) or _text(draft.get("address") if isinstance(draft.get("address"), str) else "")
    expected = str(ticket.get("addressRefined") or ticket.get("address") or "")
    result.details = {"entered": entered, "expected": expected, "source": _text(block.get("source")) or "manual"}
    if not expected:
        result.applicable = False
        return result
    if not entered:
        result.errors.append(rules.OP_ADDRESS_MISSING.error(step="field:address"))
        result.score = 0.0
        return result
    if not address_nlp.load_streets():
        result.available = False
        result.warnings.append("Справочник улиц недоступен: адрес не проверялся")
        return result
    check = address_nlp.compare(entered, expected)
    entered_name = check.entered.street.name if check.entered.street else check.entered.query
    expected_name = check.expected.street.name if check.expected.street else check.expected.query
    result.details.update({"kind": check.kind, "ratio": check.ratio, "expectedStreet": expected_name, "enteredStreet": entered_name})
    if check.kind == "lookalike":
        result.errors.append(rules.ADDRESS_LOOKALIKE.error(step="field:address", entered=entered_name, expected=expected_name))
    elif check.kind == "typo":
        result.errors.append(rules.ADDRESS_TYPO.error(step="field:address", entered=check.entered.query, expected=expected_name))
    elif check.kind == "mismatch":
        result.errors.append(rules.ADDRESS_MISMATCH.error(step="field:address", entered=entered_name, expected=expected_name))
    elif check.kind == "unknown":
        # Адрес билета вне справочника (регион, описательный) — сверяем лексически по основам слов.
        coverage = semantic.lexical_coverage(expected, entered)
        result.details["coverage"] = round(coverage, 2)
        if coverage < 0.5:
            result.errors.append(rules.ADDRESS_MISMATCH.error(step="field:address", entered=entered, expected=expected))
            result.score = 0.0
            return result
        return result
    result.score = ADDRESS_SCORES.get(check.kind, 0.0)
    return result


def description_facts(draft: dict[str, Any], ticket: dict[str, Any], threshold: float) -> ComponentResult:
    """Полнота описания со слов заявителя: обязательные факты билета покрыты по смыслу, не побуквенно."""
    result = ComponentResult(name="description_facts", score=1.0)
    threshold = max(threshold, FACT_THRESHOLD)
    text = _text(draft.get("description"))
    facts = ticket_facts(ticket)
    result.details = {"facts": facts}
    if not facts:
        result.applicable = False
        return result
    if not text:
        result.errors.append(rules.OP_EMPTY_DESCRIPTION.error(step="field:description"))
        result.score = 0.0
        result.details["missing"] = facts
        return result
    coverage = semantic.covers_key_phrases(text, facts, threshold)
    result.available = coverage.available
    missing = semantic.missing_key_phrases(text, facts, threshold)
    # Факт присутствует дословно с опечатками («этоже» ≈ «этаже») — это ошибка грамотности, а не потеря факта.
    missing = [fact for fact in missing if _fuzzy_coverage(_content_words(fact), text) < 1.0]
    # Факты с отрицанием («пострадавших нет», «не газифицирован»): эмбеддер путает «X нет» с «Y нет» (rubert-tiny2 даёт
    # ≈0,84 для «пламени нет» ↔ «пострадавших нет»), поэтому дополнительно требуется общее содержательное слово.
    for fact in facts:
        if fact not in missing and _negated(fact) and not _fuzzy_overlap(_content_words(fact), text):
            missing.append(fact)
    covered_share = (len(facts) - len(missing)) / len(facts)
    for fact in missing:
        result.errors.append(rules.OP_LOST_FACT.error(step="field:description", fact=fact))
    result.details.update({"missing": missing, "scores": {k: round(v, 3) for k, v in coverage.details.items()}})
    # Потерянный факт — major: помимо доли покрытия снимается 0,25 за каждый (решение команды по T078).
    result.score = clamp01(min(coverage.score, covered_share) - 0.25 * len(missing))
    if not coverage.available:
        result.warnings.append("Смысловое сравнение недоступно (нет эмбеддера): факты сверены лексически")
    return result


NEGATIONS = ("нет", "не", "без", "отсутств")
MIN_CONTENT_CHARS = 4


def _negated(fact: str) -> bool:
    words = re.findall(r"[а-яё]+", fact.lower())
    return any(w == n or (n == "отсутств" and w.startswith(n)) for w in words for n in NEGATIONS)


def _content_words(fact: str) -> str:
    return " ".join(w for w in re.findall(r"[а-яё]+", fact.lower()) if len(w) >= MIN_CONTENT_CHARS and w not in NEGATIONS)


def _fuzzy_coverage(words: str, text: str, ratio: int = 80) -> float:
    """Доля содержательных слов факта, найденных в тексте с точностью до опечаток («пострадавшых» ≈ «пострадавших»)."""
    wanted = words.split()
    if not wanted:
        return 0.0
    text_words = [w for w in re.findall(r"[а-яё]+", text.lower()) if len(w) >= MIN_CONTENT_CHARS]
    return sum(1 for a in wanted if any(fuzz.ratio(a, b) >= ratio for b in text_words)) / len(wanted)


def _fuzzy_overlap(words: str, text: str, ratio: int = 80) -> bool:
    return _fuzzy_coverage(words, text, ratio) > 0


def _sign_present(sign: str, entered: list[str]) -> bool:
    wanted = nl.norm(sign)
    return any(nl.norm(e) == wanted or fuzz.token_set_ratio(wanted, nl.norm(e)) >= SIGN_MATCH_RATIO for e in entered)


def signs_flags(draft: dict[str, Any], ticket: dict[str, Any]) -> ComponentResult:
    """Признаки-кнопки по expectedTags билета и флаги «Пострадавшие» / «Отказ от СМП» / ЧС-ЧП."""
    result = ComponentResult(name="signs_flags", score=1.0)
    expected = [str(t) for t in (ticket.get("expectedTags") or []) if str(t).strip()]
    entered = draft_signs(draft)
    missing = [sign for sign in expected if not _sign_present(sign, entered)]
    for sign in missing:
        result.errors.append(rules.OP_MISSING_SIGN.error(step="field:what.signs", sign=sign))
    checks = len(expected)
    failed = len(missing)
    casualties = _get(draft, "what", "casualties", default={}) or {}
    victims = ticket.get("victims") if isinstance(ticket.get("victims"), dict) else None
    if victims and int(victims.get("count") or 0) > 0:
        checks += 1
        if not casualties.get("injured"):
            failed += 1
            result.errors.append(rules.OP_MISSING_FLAG.error(step="field:what.casualties.injured", flag="Пострадавшие", reason=f"есть пострадавшие ({victims.get('count')})"))
    if ticket.get("noAmbulance"):
        checks += 1
        if not casualties.get("ambulanceRefused"):
            failed += 1
            result.errors.append(rules.OP_MISSING_FLAG.error(step="field:what.casualties.ambulanceRefused", flag="Отказ от СМП", reason="заявитель отказался от скорой помощи"))
    emergency = draft.get("emergency") if isinstance(draft.get("emergency"), dict) else {}
    ticket_emergency = ticket.get("emergency") if isinstance(ticket.get("emergency"), dict) else {}
    for flag, title in (("chs", "ЧС"), ("chp", "ЧП")):
        if emergency.get(flag) and not ticket_emergency.get(flag):
            result.errors.append(rules.OP_EXTRA_FLAG.error(step=f"field:emergency.{flag}", flag=title))
    extra_flags = sum(1 for e in result.errors if e.rule_id == "op-s3")
    result.details = {"expectedSigns": expected, "enteredSigns": entered, "missingSigns": missing, "checks": checks, "failed": failed, "extraFlags": extra_flags}
    if checks == 0:
        result.score = clamp01(1.0 - 0.1 * extra_flags)
        result.applicable = extra_flags > 0
        return result
    result.score = clamp01((checks - failed) / checks - 0.1 * extra_flags)
    return result


def _name_matches(entered: str, expected: str) -> bool:
    a, b = nl.norm(entered), nl.norm(expected)
    if not a or not b:
        return False
    tokens_a, tokens_b = set(a.split()), set(b.split())
    if tokens_a & tokens_b:
        return True
    return fuzz.token_set_ratio(a, b) >= NAME_MATCH_RATIO or any(fuzz.ratio(x, y) >= NAME_MATCH_RATIO for x in tokens_a for y in tokens_b)


def applicant_phone(draft: dict[str, Any], ticket: dict[str, Any]) -> ComponentResult:
    """Заявитель (ФИО по любому совпавшему слову, статус) и предоставленный телефон (по цифрам)."""
    result = ComponentResult(name="applicant_phone", score=1.0)
    caller = ticket.get("caller") if isinstance(ticket.get("caller"), dict) else {}
    expected_name, expected_status, expected_phone = _text(caller.get("name")), _text(caller.get("status")), _text(caller.get("phone"))
    entered_name, entered_status = _text(_get(draft, "applicant", "name")), _text(_get(draft, "applicant", "status"))
    entered_phone = _text(_get(draft, "phones", "provided")) or _text(_get(draft, "phones", "aon"))
    checks, failed = 0, 0
    if expected_name.lower() not in UNKNOWN_NAMES:
        checks += 1
        if not _name_matches(entered_name, expected_name):
            failed += 1
            result.errors.append(rules.OP_APPLICANT_NAME.error(step="field:applicant.name", entered=entered_name or "—", expected=expected_name))
    if expected_status:
        checks += 1
        if nl.norm(entered_status) != nl.norm(expected_status):
            failed += 1
            result.errors.append(rules.OP_APPLICANT_STATUS.error(step="field:applicant.status", entered=entered_status or "—", expected=expected_status))
    if normalize_phone(expected_phone):
        checks += 1
        if not normalize_phone(entered_phone):
            failed += 1
            result.errors.append(rules.OP_PHONE_MISSING.error(step="field:phones.provided", expected=expected_phone))
        elif normalize_phone(entered_phone) != normalize_phone(expected_phone):
            failed += 1
            result.errors.append(rules.OP_PHONE.error(step="field:phones.provided", entered=entered_phone, expected=expected_phone))
    result.details = {"expected": {"name": expected_name, "status": expected_status, "phone": expected_phone}, "entered": {"name": entered_name, "status": entered_status, "phone": entered_phone}, "checks": checks, "failed": failed}
    if checks == 0:
        result.applicable = False
        return result
    result.score = clamp01((checks - failed) / checks)
    return result


def grammar(draft: dict[str, Any], limit: int) -> ComponentResult:
    """Грамотность ручного ввода: описание (орфография + синтаксис), опросная карта и описательный адрес — короткие
    фрагменты, только орфография; ФИО и улицы не проверяются (адрес — по справочнику)."""
    errors = [e.to_contract() for e in grammar_nlp.check(_text(draft.get("description")), "description")] if _text(draft.get("description")) else []
    for field, value in (("pollAnswers", _text(_get(draft, "what", "pollAnswers"))), ("address.descriptive", _text(_get(draft, "address", "descriptive")))):
        if value:
            errors.extend(e.to_contract() for e in grammar_nlp.check_spelling(value, field))
    count = len(errors)
    result = ComponentResult(name="grammar", score=1.0, available=grammar_nlp.available(), details={"count": count, "limit": limit, "grammarErrors": errors})
    if count > limit:
        result.errors.append(rules.GRAMMAR_LIMIT.error(count=count, limit=limit))
        result.score = clamp01(1.0 - 0.30 * count)
    else:
        result.score = clamp01(1.0 - 0.10 * count)
    if not result.available:
        result.warnings.append("Проверка орфографии недоступна (нет словаря): учтён только синтаксис")
    return result


def activity(attempt: dict[str, Any]) -> ComponentResult:
    """(h) прослушивания и подсказки — информационно, без веса и без штрафа по умолчанию (FR-017)."""
    events = list(attempt.get("events") or [])
    replays = int(attempt.get("replays") or sum(1 for e in events if e.get("type") == "replay"))
    hints = int(attempt.get("hintsShown") or sum(1 for e in events if e.get("type") == "hintShown"))
    result = ComponentResult(name="activity", score=1.0, applicable=False, details={"replays": replays, "hintsShown": hints, "events": len(events)})
    if replays > 1:
        result.warnings.append(f"Запись прослушана повторно: {replays} раз(а)")
    if hints:
        result.warnings.append(f"Показано подсказок: {hints}")
    return result


# ─── fieldDiff и сборка ───────────────────────────────────────────────────────────────────────────


def build_field_diff(draft: dict[str, Any], ticket: dict[str, Any], components: dict[str, ComponentResult], reference: dict[str, Any]) -> list[dict[str, Any]]:
    caller = ticket.get("caller") if isinstance(ticket.get("caller"), dict) else {}
    ft, sf, ap, ad, df = components["final_type"], components["signs_flags"], components["applicant_phone"], components["address"], components["description_facts"]
    errors_of = lambda comp, step: any(e.step == step for e in comp.errors)  # noqa: E731
    victims = ticket.get("victims") if isinstance(ticket.get("victims"), dict) else None
    diff = [
        {"field": "applicant.name", "entered": ap.details.get("entered", {}).get("name", ""), "expected": caller.get("name", ""), "ok": not errors_of(ap, "field:applicant.name")},
        {"field": "applicant.status", "entered": ap.details.get("entered", {}).get("status", ""), "expected": caller.get("status", ""), "ok": not errors_of(ap, "field:applicant.status")},
        {"field": "phones.provided", "entered": ap.details.get("entered", {}).get("phone", ""), "expected": caller.get("phone", ""), "ok": not errors_of(ap, "field:phones.provided")},
        {"field": "address", "entered": ad.details.get("entered", ""), "expected": ad.details.get("expected", ""), "ok": not ad.errors},
        {"field": "what.finalType", "entered": ft.details.get("actualFinalType", ""), "expected": ft.details.get("expectedGroup", ""), "ok": not errors_of(ft, "field:what.finalType")},
        {"field": "what.signs", "entered": sf.details.get("enteredSigns", []), "expected": sf.details.get("expectedSigns", []), "ok": not sf.details.get("missingSigns")},
        {"field": "what.casualties.injured", "entered": bool(_get(draft, "what", "casualties", "injured", default=False)), "expected": bool(victims and int(victims.get("count") or 0) > 0), "ok": not errors_of(sf, "field:what.casualties.injured")},
        {"field": "description", "entered": _text(draft.get("description")), "expected": ticket.get("summary", ""), "ok": not df.errors},
        {"field": "notificationList", "entered": [nl.service_title(s, reference) for s in ft.details.get("enteredServices", [])], "expected": [nl.service_title(s, reference) for s in ft.details.get("expectedServices", [])], "ok": not ft.details.get("missingServices")},
    ]
    if ticket.get("noAmbulance") is not None:
        diff.append({"field": "what.casualties.ambulanceRefused", "entered": bool(_get(draft, "what", "casualties", "ambulanceRefused", default=False)), "expected": bool(ticket.get("noAmbulance")), "ok": not errors_of(sf, "field:what.casualties.ambulanceRefused")})
    return diff


def resolve_weights(weights: dict[str, float] | None) -> dict[str, float]:
    merged = dict(DEFAULT_WEIGHTS_OPERATOR112)
    for key, value in (weights or {}).items():
        if key in merged and isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            merged[key] = float(value)
    return merged


def normalize_weights(weights: dict[str, float], components: dict[str, ComponentResult]) -> dict[str, float]:
    applicable = {name: weights.get(name, 0.0) for name, comp in components.items() if comp.applicable}
    total = sum(applicable.values())
    if total <= 0:
        return {name: 0.0 for name in components}
    return {name: applicable.get(name, 0.0) / total for name in components}


def assess(attempt: dict[str, Any], ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any], *, weights: dict[str, float] | None = None, params: dict[str, Any] | None = None, options: AssessOptions | None = None) -> AssessmentResult:
    options = options or AssessOptions()
    draft = draft_of(attempt)
    answer_ms, submit_ms, grammar_limit = _norms(options, params)
    components: dict[str, ComponentResult] = {}
    components["answer_timing"] = answer_timing(attempt, answer_ms, submit_ms)
    components["final_type"] = final_type(draft, ticket, entries, reference)
    components["address"] = address(draft, ticket)
    components["description_facts"] = description_facts(draft, ticket, options.semantic_threshold)
    components["signs_flags"] = signs_flags(draft, ticket)
    components["applicant_phone"] = applicant_phone(draft, ticket)
    components["grammar"] = grammar(draft, grammar_limit)
    components["activity"] = activity(attempt)
    effective = normalize_weights(resolve_weights(weights), components)
    total = sum(effective[name] * comp.score for name, comp in components.items() if comp.applicable)
    if any(e.rule_id in ("op-f1", "op-f0") for e in components["final_type"].errors):
        total = min(total, FINAL_TYPE_CAP)
    grammar_errors = list(components["grammar"].details.get("grammarErrors") or [])
    return AssessmentResult(
        mode=MODE_OPERATOR112,
        version=ASSESSOR_VERSION,
        components=components,
        weights=effective,
        grammar_errors=grammar_errors,
        total=clamp01(total),
        field_diff=build_field_diff(draft, ticket, components, reference),
    )


__all__ = ["ASSESSOR_VERSION", "COMPONENT_NAMES", "assess", "draft_of", "ticket_facts"]
