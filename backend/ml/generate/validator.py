"""Валидатор билетов (FR-023, R22): шесть критериев → `ValidationReport { checks, passed, needsReview }`.

Билет — `IncidentCard` контракта (с id или без). Критерии и источники правил:
- `category` — группа ЕКП подтверждена классификатором R4: совпадение с предсказанием при уверенности ≥ 0,6;
  ниже порога или группа во втором/третьем кандидате — «требует ручной проверки»; иная группа — не пройдено.
  Для ловушки `operatorMistake` ожидается обратное: фабула НЕ соответствует типу (принцип II: ловушка — из билета).
- `address` — справочник улиц Москвы R3: улица найдена — пройдено; похожая улица (85 ≤ ratio < 100) — ручная
  проверка с подсказкой; другой регион (`crossRegion`) — справочник не применим; описательный адрес без
  улицы (МКАД, метро, ж/д, парк, «дорога от…», Московская область) — ручная проверка; названная улица не найдена — не пройдено.
- `requiredFields` — группа из `reference.incidentGroups`, фабула, адрес, заявитель (ФИО, телефон, статус),
  ожидаемые службы (`spec/05` §5).
- `duplicate` — косинус «фабула + адрес» к существующим билетам ≥ 0,92 (`ml.nlp.dedup`); объявленные связи
  (`duplicateOf`, `baseCardId`, `fabulaCardId` — источники вариации) исключаются из сравнения и показываются отдельно.
- `grammar` — орфография фабулы и адреса (R2); опечатки — не пройдено, список в `details`.
- `consistency` — факты фабулы ↔ признаки: «пострадавшие» без отрицания ↔ `victims`; «03 не требуется» ↔
  `noAmbulance`; другая область в адресе ↔ `crossRegion`.
Без ML-компонент (FR-043) критерий помечается `available=false` и уходит в ручную проверку, не блокируя билет.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from ml.classify import ekp_group_classifier as classifier
from ml.nlp import address as address_nlp
from ml.nlp import dedup
from ml.nlp import grammar as grammar_nlp

VALIDATOR_VERSION = "validator-1.0.0"
CHECK_IDS = ("category", "address", "requiredFields", "duplicate", "grammar", "consistency")

VICTIMS_MENTION = re.compile(r"пострадав|ранен|травм|погиб|сознани", re.IGNORECASE)
VICTIMS_NEGATION = re.compile(r"пострадавших нет|без пострадавших|нет пострадавших|не пострадал|пострадавших не |информации нет|без раненых|погибших нет", re.IGNORECASE)
NO_AMBULANCE = re.compile(r"03 не (требуется|нужн)|скорая не (требуется|нужн)|без 03|в 03 не нуждается", re.IGNORECASE)
OTHER_REGION = re.compile(r"(?<![А-Яа-яЁё])([А-ЯЁ][а-яё]+ская)\s+обл(?:\.|асть)", re.IGNORECASE)
MOSCOW_REGION_WORDS = ("московская",)
DESCRIPTIVE_MARKERS = re.compile(r"\b(МКАД|ТТК|метро|ж/д|платформа|станци|парк|лес|озеро|пруд|мост|дорог|трасс|съезд|км\b|МО,|Московская обл|Новая Москва|СНТ|дер\.|пос\.|г\.о\.|р-н)", re.IGNORECASE)
STREET_TYPE_IN_TEXT = re.compile(r"(^|[\s,(])(ул\.?|улица|пер\.?|переулок|просп\.?|проспект|пр-т|пр-кт|проезд|пр-д|бульвар|б-р|наб\.?|набережная|площадь|пл\.|аллея|тупик|шоссе|ш\.)(?=[\s,.)]|$)", re.IGNORECASE)
REQUIRED_CALLER = ("name", "phone", "status")


@dataclass
class Check:
    id: str
    passed: bool
    message: str
    needsReview: bool = False
    confidence: float | None = None
    available: bool = True
    details: dict[str, Any] = field(default_factory=dict)

    def to_contract(self) -> dict[str, Any]:
        data = asdict(self)
        if data["confidence"] is None:
            del data["confidence"]
        return data


@dataclass
class ValidationReport:
    checks: list[Check]
    version: str = VALIDATOR_VERSION

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.checks)

    @property
    def needsReview(self) -> bool:  # noqa: N802 — имя поля контракта
        return any(c.needsReview for c in self.checks)

    def check(self, check_id: str) -> Check:
        return next(c for c in self.checks if c.id == check_id)

    def to_contract(self) -> dict[str, Any]:
        return {"version": self.version, "passed": self.passed, "needsReview": self.needsReview, "checks": [c.to_contract() for c in self.checks]}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def check_required_fields(ticket: dict[str, Any], groups: tuple[str, ...] | None) -> Check:
    missing: list[str] = []
    if not _text(ticket.get("group")):
        missing.append("group")
    elif groups and ticket["group"] not in groups:
        return Check("requiredFields", False, f"Группа ЕКП «{ticket['group']}» отсутствует в справочнике", details={"missing": ["group"]})
    for key in ("summary", "address"):
        if not _text(ticket.get(key)):
            missing.append(key)
    caller = ticket.get("caller") if isinstance(ticket.get("caller"), dict) else {}
    missing.extend(f"caller.{key}" for key in REQUIRED_CALLER if not _text(caller.get(key)))
    services = ticket.get("expectedServices")
    if not isinstance(services, list) or not any(_text(s) for s in services):
        missing.append("expectedServices")
    if missing:
        return Check("requiredFields", False, "Не заполнены обязательные поля: " + ", ".join(missing), details={"missing": missing})
    return Check("requiredFields", True, "Обязательные поля заполнены")


def check_category(ticket: dict[str, Any]) -> Check:
    group = _text(ticket.get("group"))
    summary = _text(ticket.get("summary"))
    if not group or not summary:
        return Check("category", False, "Нет группы ЕКП или фабулы для проверки категории", details={"reason": "empty"})
    prediction = classifier.predict(summary)
    details: dict[str, Any] = {"predicted": prediction.group, "top": [{"group": g, "confidence": round(p, 4)} for g, p in prediction.top], "mode": prediction.mode}
    trap = ticket.get("trap")
    if not prediction.available:
        return Check("category", True, "Классификатор недоступен: категорию подтвердит преподаватель", needsReview=True, confidence=None, available=False, details=details)
    if trap == "operatorMistake":
        mismatch = prediction.group != group
        message = "Ловушка «ошибка оператора 112»: фабула не соответствует типу карточки" if mismatch else "Ловушка не сработала: классификатор подтверждает тип карточки"
        return Check("category", mismatch, message, needsReview=not mismatch, confidence=round(prediction.confidence, 4), details={**details, "trap": trap})
    if prediction.group == group:
        if prediction.confident:
            return Check("category", True, f"Категория подтверждена (уверенность {prediction.confidence:.2f})", confidence=round(prediction.confidence, 4), details=details)
        return Check("category", True, f"Категория совпадает, но уверенность {prediction.confidence:.2f} ниже 0,6 — проверьте вручную", needsReview=True, confidence=round(prediction.confidence, 4), details=details)
    rank = prediction.rank_of(group)
    if rank is not None:
        return Check("category", False, f"Классификатор предлагает «{prediction.group}»; указанная группа — {rank + 1}-й кандидат", needsReview=True, confidence=round(prediction.confidence, 4), details=details)
    return Check("category", False, f"Категория не подтверждена: классификатор предлагает «{prediction.group}»", confidence=round(prediction.confidence, 4), details=details)


def check_address(ticket: dict[str, Any]) -> Check:
    text = _text(ticket.get("address"))
    if not text:
        return Check("address", False, "Адрес не указан")
    if ticket.get("crossRegion"):
        return Check("address", True, "Происшествие в другом регионе: справочник улиц Москвы не применяется", details={"kind": "crossRegion"})
    if not address_nlp.load_streets():
        return Check("address", True, "Справочник улиц недоступен: адрес проверит преподаватель", needsReview=True, available=False)
    match = address_nlp.match(text)
    details: dict[str, Any] = {"query": match.query, "street": match.street.name if match.street else None, "ratio": match.ratio}
    if match.exact:
        return Check("address", True, f"Улица найдена в справочнике: {match.street.name}", confidence=1.0, details={**details, "kind": "exact"})
    if match.lookalike:
        return Check("address", True, f"Похожая улица справочника: «{match.query}» → {match.street.name}. Проверьте написание", needsReview=True, confidence=round(match.ratio / 100, 2), details={**details, "kind": "lookalike"})
    if DESCRIPTIVE_MARKERS.search(text) or not STREET_TYPE_IN_TEXT.search(text):
        return Check("address", True, "Адрес описательный, улица в справочнике не найдена — уточните ориентиры вручную", needsReview=True, details={**details, "kind": "descriptive"})
    return Check("address", False, f"Улица «{match.query}» не найдена в справочнике улиц Москвы", details={**details, "kind": "unknown"})


def _declared_links(ticket: dict[str, Any]) -> set[str]:
    return {str(v) for v in (ticket.get("duplicateOf"), ticket.get("baseCardId"), ticket.get("fabulaCardId")) if isinstance(v, str) and v}


def check_duplicate(ticket: dict[str, Any], existing: list[dict[str, Any]]) -> Check:
    own_id = ticket.get("id")
    links = _declared_links(ticket)
    # Связь, объявленная с другой стороны (c-047.duplicateOf = c-003), тоже не считается неожиданным дублем.
    others = [c for c in existing if c.get("id") != own_id and c.get("id") not in links and not (own_id and c.get("duplicateOf") == own_id)]
    text = dedup.ticket_text(ticket)
    if not others or not text:
        message = "Объявленный дубль карточки " + ", ".join(sorted(links)) if ticket.get("duplicateOf") else "Похожих билетов нет"
        return Check("duplicate", True, message, available=dedup.available(), details={"declared": sorted(links)})
    nearest = dedup.nearest(text, [dedup.ticket_text(c) for c in others])
    nearest_id = others[nearest.index].get("id") if nearest.index >= 0 else None
    details = {"nearest": nearest_id, "similarity": round(nearest.similarity, 4), "threshold": dedup.DUPLICATE_THRESHOLD if nearest.available else dedup.LEXICAL_THRESHOLD, "declared": sorted(links), "model": dedup.model_name()}
    if nearest.duplicate:
        return Check("duplicate", False, f"Дубликат по смыслу билета {nearest_id} (близость {nearest.similarity:.2f})", confidence=round(nearest.similarity, 4), available=nearest.available, details=details)
    if ticket.get("duplicateOf"):
        return Check("duplicate", True, f"Объявленный дубль карточки {ticket['duplicateOf']}; ближайший прочий — {nearest_id} ({nearest.similarity:.2f})", confidence=round(nearest.similarity, 4), available=nearest.available, details=details)
    if not nearest.available:
        return Check("duplicate", True, f"Эмбеддинги недоступны: лексическая близость к {nearest_id} — {nearest.similarity:.2f}", needsReview=True, confidence=round(nearest.similarity, 4), available=False, details=details)
    return Check("duplicate", True, f"Ближайший билет {nearest_id}: близость {nearest.similarity:.2f} < {dedup.DUPLICATE_THRESHOLD}", confidence=round(nearest.similarity, 4), details=details)


def check_grammar(ticket: dict[str, Any]) -> Check:
    errors = [e.to_contract() for key in ("summary", "address", "addressRefined") for e in grammar_nlp.check_spelling(_text(ticket.get(key)), field=key)]
    available = grammar_nlp.available()
    if errors:
        words = ", ".join(f"«{e['wrong']}» → «{e['expected']}»" for e in errors[:5])
        return Check("grammar", False, f"Опечатки: {words}", available=available, details={"errors": errors})
    if not available:
        return Check("grammar", True, "Словарь орфографии недоступен: грамматику проверит преподаватель", needsReview=True, available=False)
    return Check("grammar", True, "Опечаток не найдено", details={"errors": []})


def check_consistency(ticket: dict[str, Any]) -> Check:
    summary = _text(ticket.get("summary"))
    address = _text(ticket.get("address"))
    issues: list[str] = []
    victims = ticket.get("victims") if isinstance(ticket.get("victims"), dict) else None
    mentions = bool(VICTIMS_MENTION.search(summary))
    negated = bool(VICTIMS_NEGATION.search(summary))
    if mentions and not negated and not victims:
        issues.append("в фабуле есть пострадавшие, но признак victims не заполнен")
    if victims and negated and not mentions_positive(summary):
        issues.append("фабула отрицает пострадавших, но признак victims заполнен")
    if NO_AMBULANCE.search(summary) and not ticket.get("noAmbulance"):
        issues.append("в фабуле «03 не требуется», но признак noAmbulance не выставлен")
    region = OTHER_REGION.search(address)
    other_region = bool(region) and region.group(1).lower() not in MOSCOW_REGION_WORDS
    if other_region and not ticket.get("crossRegion"):
        issues.append(f"адрес в другом регионе ({region.group(0)}), но признак crossRegion не выставлен")
    if ticket.get("crossRegion") and address.lower().startswith("москва"):
        issues.append("признак crossRegion выставлен, но адрес — Москва")
    if issues:
        return Check("consistency", False, "Факты фабулы не согласованы с признаками: " + "; ".join(issues), details={"issues": issues})
    return Check("consistency", True, "Факты фабулы согласованы с признаками")


def mentions_positive(summary: str) -> bool:
    """Есть ли упоминание пострадавших вне отрицающего оборота («5 пострадавших, … пострадавших нет» — редкость)."""
    stripped = VICTIMS_NEGATION.sub(" ", summary)
    return bool(VICTIMS_MENTION.search(stripped))


def validate(ticket: dict[str, Any], existing: list[dict[str, Any]] | None = None, *, groups: tuple[str, ...] | None = None) -> ValidationReport:
    """Полный отчёт по билету; `existing` — банк билетов для дедупликации; `groups` — справочник групп (по умолчанию из сидов)."""
    known_groups = groups if groups is not None else classifier.groups()
    checks = [
        check_category(ticket),
        check_address(ticket),
        check_required_fields(ticket, known_groups),
        check_duplicate(ticket, existing or []),
        check_grammar(ticket),
        check_consistency(ticket),
    ]
    return ValidationReport(checks=checks)


def validate_ai_scenario(
    ticket: dict[str, Any],
    actions: list[dict[str, Any]],
    *,
    mode: str,
    classifier_entries: list[dict[str, Any]],
    profile_groups: set[str],
    rule_source_ids: list[str],
    address_allowlist: set[str] | None = None,
) -> list[dict[str, str]]:
    """Структурные проверки AI-версии; каждое нарушение возвращается с точным полем."""
    errors: list[dict[str, str]] = []
    group = _text(ticket.get("group"))
    code = _text(ticket.get("classifierCode"))
    entry = next((item for item in classifier_entries if item.get("code") == code), None)
    if not code or entry is None:
        errors.append({"fieldPath": "classifierCode", "code": "unknown_classifier_code", "message": f"Код ЕКП «{code or 'не указан'}» отсутствует в справочнике"})
    elif entry.get("group") != group:
        errors.append({"fieldPath": "group", "code": "classifier_group_mismatch", "message": f"Код ЕКП «{code}» относится к группе «{entry.get('group')}», а не «{group}»"})

    address = _text(ticket.get("address"))
    address_match = address_nlp.match(address) if address else None
    normalized_address = " ".join(address.casefold().replace("ё", "е").split())
    if (
        address_match is None
        or not address_match.exact
        or (address_allowlist is not None and normalized_address not in address_allowlist)
    ):
        errors.append({"fieldPath": "address", "code": "address_not_in_directory", "message": f"Адрес «{address or 'не указан'}» не подтверждён локальным справочником"})

    action_names = [item.get("action") for item in actions if isinstance(item, dict)]
    if len(action_names) != len(actions) or any(not isinstance(item, str) or not item.strip() for item in action_names):
        errors.append({"fieldPath": "etalon.expectedActions", "code": "invalid_action", "message": "Каждое обязательное действие должно иметь непустое имя"})
    rule_ids = {str(value) for value in rule_source_ids}
    for index, item in enumerate(actions):
        if not isinstance(item, dict) or not (set(item.get("sourceRef") or []) & rule_ids):
            errors.append({"fieldPath": f"etalon.expectedActions.{index}.sourceRef", "code": "missing_action_source", "message": f"Действие №{index + 1} не ссылается на разрешённое правило"})

    if mode == "dds":
        if group not in profile_groups:
            errors.append({"fieldPath": "group", "code": "dds_profile_not_allowed", "message": f"Группа «{group}» не входит в допустимый профиль ДДС"})
        accepted = next((i for i, action in enumerate(action_names) if action == "status:accepted"), None)
        finished = next((i for i, action in enumerate(action_names) if action == "status:workDone"), None)
        if accepted is None or finished is None or accepted >= finished:
            errors.append({"fieldPath": "etalon.expectedActions", "code": "invalid_action_order", "message": "Для режима ДДС обязательны status:accepted перед status:workDone"})
        if not action_names or not str(action_names[0]).startswith("openCard:"):
            errors.append({"fieldPath": "etalon.expectedActions", "code": "missing_open_card", "message": "Первым действием ДДС должно быть открытие карточки"})
    elif mode == "operator112":
        required = ("captureCaller", "captureAddress", "classify", "submit")
        positions = [action_names.index(action) if action in action_names else None for action in required]
        if any(position is None for position in positions) or positions != sorted(positions, key=lambda item: -1 if item is None else item):
            errors.append({"fieldPath": "etalon.expectedActions", "code": "invalid_operator_action_order", "message": "В режиме 112 обязательны captureCaller → captureAddress → classify → submit"})
    else:
        errors.append({"fieldPath": "mode", "code": "unknown_mode", "message": f"Режим «{mode}» не поддерживается"})

    return errors
