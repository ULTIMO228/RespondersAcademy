"""Размеченная выборка оценщика режима A (T078, SC-004): `uv run python -m ml.scripts.build_labeled_operator112`.

Детерминированно (seed 112) из московских билетов `spec/000-фронт/mocks/cards.json` строит карточки специалиста-112 в вариантах:
`etalon`, `wrongFinalType`, `lostFact`, `addressLookalike`, `missingSign`, `phoneMismatch`, `answerTimeout`, `typos`.
Каждый файл `data/labeled/operator112/op-NNN-<variant>.json`: `attempt` (OperatorAttempt с `cardSnapshot`), `ticket`
(IncidentCard), `expectedErrors` (типы), `expectedGrammarErrors`, `expertScore` по рубрике README.
"""

from __future__ import annotations

import copy
import json
import random
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz

from app.config import get_settings
from ml.assess.operator112 import ticket_facts
from ml.classify import notification_list as nl
from ml.nlp import address as address_nlp

SEED = 112
OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "operator112"
VARIANTS = ("etalon", "wrongFinalType", "lostFact", "addressLookalike", "missingSign", "phoneMismatch", "answerTimeout", "typos")
TYPOS = [("горит", "гарит"), ("пострадавших", "пострадавшых"), ("человек", "чиловек"), ("квартире", "квартере"), ("машина", "мошина"), ("упал", "упол"), ("сильный", "сильый"), ("запах", "запох"), ("дерево", "дериво"), ("мужчина", "мущина"), ("около", "окало"), ("этаже", "этоже"), ("нет", "нед"), ("улице", "улеце"), ("дома", "дама"), ("подъезд", "подьезд"), ("автомобил", "афтомобил"), ("женщина", "женшина"), ("ребёнок", "ребёнак"), ("сознании", "сознание")]
PER_VARIANT_LIMIT = {"etalon": 8, "wrongFinalType": 8, "lostFact": 8, "missingSign": 8, "phoneMismatch": 8, "answerTimeout": 8}  # редкие варианты — все
EXPERT = {"etalon": 96, "wrongFinalType": 40, "lostFact": 82, "addressLookalike": 78, "missingSign": 80, "phoneMismatch": 84, "answerTimeout": 86, "typos": 80}
MSK = timezone(timedelta(hours=3))


def _read(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_inputs() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    root = get_settings().seed_dir / "spec" / "000-фронт" / "mocks"
    cards = _read(root / "cards.json")["cards"]
    entries = _read(root / "classifier.json")["entries"]
    reference = _read(root / "reference.json")
    return cards, entries, reference


def street_of(ticket: dict[str, Any]) -> address_nlp.Street | None:
    match = address_nlp.match(str(ticket.get("addressRefined") or ticket.get("address") or ""))
    return match.street if match.exact else None


def eligible(ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any]) -> bool:
    """Московский билет с улицей справочника, ФИО заявителя и строкой ЕКП по признакам — основа всех вариантов."""
    if ticket.get("crossRegion") or street_of(ticket) is None:
        return False
    if str((ticket.get("caller") or {}).get("name") or "").lower() in ("не указан", "себе", "сама", "мама", "папа", ""):
        return False
    chosen = nl.build(entries, reference, signs=list(ticket.get("expectedTags") or []), group=str(ticket.get("group")))
    return chosen.entry is not None and bool(nl.expected_service_ids(list(ticket.get("expectedServices") or []), reference))


def format_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    return f"+7 ({digits[:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:]}" if len(digits) == 10 else phone


def etalon_draft(ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any]) -> dict[str, Any]:
    caller = ticket.get("caller") or {}
    street = street_of(ticket)
    chosen = nl.build(entries, reference, signs=list(ticket.get("expectedTags") or []), group=str(ticket.get("group")), flags=["Пострадавшие"] if ticket.get("victims") else [])
    expected_ids = nl.expected_service_ids(list(ticket.get("expectedServices") or []), reference)
    services = [{"serviceId": sid, "addedBy": "auto"} for sid in chosen.service_ids]
    services += [{"serviceId": sid, "addedBy": "manual"} for sid in expected_ids if sid not in chosen.service_ids]
    victims = ticket.get("victims") or {}
    return {
        "applicant": {"name": str(caller.get("name") or ""), "status": str(caller.get("status") or "очевидец")},
        "phones": {"aon": format_phone(str(caller.get("phone") or "")), "provided": format_phone(str(caller.get("phone") or "")), "onSite": ""},
        "address": {"formal": str(ticket.get("address") or ""), "street": street.name if street else "", "house": "", "source": "directory", "descriptive": ""},
        "what": {"pollAnswers": str(ticket.get("summary") or ""), "signs": list(ticket.get("expectedTags") or []), "finalType": chosen.final_type, "classifierCode": chosen.classifier_code, "casualties": {"injured": int(victims.get("count") or 0) > 0, "ambulanceRefused": bool(ticket.get("noAmbulance")), "blocked": False}},
        # Описание эталона — всё, что звучит в записи: фабула и примечание о пострадавших (call_script их озвучивает).
        "description": "Со слов заявителя: " + ". ".join(part for part in (str(ticket.get("summary") or "").rstrip("."), str(victims.get("note") or "").rstrip(".")) if part) + ".",
        "emergency": {"chs": False, "chp": False},
        "notificationList": services,
    }


def base_attempt(index: int, ticket: dict[str, Any], draft: dict[str, Any], rng: random.Random, *, answer_sec: int | None = None) -> dict[str, Any]:
    opened = datetime(2026, 9, 22, 9, 0, 0, tzinfo=MSK) + timedelta(minutes=5 * index)
    answered = opened + timedelta(seconds=answer_sec if answer_sec is not None else rng.randint(3, 20))
    completed = answered + timedelta(seconds=rng.randint(90, 170))
    return {
        "id": f"op-{index:03d}",
        "cardId": ticket["id"],
        "studentId": "u-005",
        "openedAt": opened.isoformat(),
        "answeredAt": answered.isoformat(),
        "completedAt": completed.isoformat(),
        "replays": 1,
        "hintsShown": 0,
        "events": [],
        "cardSnapshot": draft,
    }


def lookalike_street(street: address_nlp.Street) -> address_nlp.Street | None:
    """Другая улица справочника, похожая на данную (85 ≤ ratio < 100) — как «Дубнинская» / «Дубининская»."""
    for candidate in address_nlp.load_streets():
        if candidate.norm == street.norm:
            continue
        ratio = fuzz.ratio(candidate.norm, street.norm)
        if 85 <= ratio < 100:
            return candidate
    return None


def other_group_entry(ticket: dict[str, Any], entries: list[dict[str, Any]], rng: random.Random) -> dict[str, Any]:
    others = [e for e in entries if nl.norm(e.get("group")) != nl.norm(ticket.get("group")) and e.get("notifications")]
    return others[rng.randrange(len(others))]


def apply_typos(text: str, count: int) -> tuple[str, int]:
    """Опечатки из списка, которые spellcheck реально замечает (иначе разметка не проверяема)."""
    from ml.nlp import grammar

    applied = 0
    for right, wrong in TYPOS:
        if applied >= count:
            break
        if right in text and grammar.check_spelling(wrong):
            text = text.replace(right, wrong, 1)
            applied += 1
    return text, applied


def make_variant(variant: str, index: int, ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any], rng: random.Random) -> dict[str, Any] | None:
    draft = etalon_draft(ticket, entries, reference)
    expected: list[str] = []
    grammar_errors = 0
    answer_sec: int | None = None
    note = "эталонная карточка: все факты, адрес по справочнику, тип и список оповещения по билету"
    if variant == "wrongFinalType":
        entry = other_group_entry(ticket, entries, rng)
        chosen_services, _ = nl.services_for_entry(entry, reference)
        draft["what"].update({"signs": nl.entry_signs(entry), "finalType": str(entry.get("finalType")), "classifierCode": str(entry.get("code"))})
        draft["notificationList"] = [{"serviceId": s.service_id, "addedBy": "auto"} for s in chosen_services]
        expected = ["wrongFinalType", "missingSign"]  # признаки чужой строки → признаки билета не выставлены
        note = f"итоговый тип другой группы: «{entry.get('finalType')}» вместо группы «{ticket.get('group')}»"
    elif variant == "lostFact":
        facts = ticket_facts(ticket)
        if len(facts) < 2:
            return None
        kept = [f for f in facts if f != facts[-1]]
        draft["description"] = "Со слов заявителя: " + ", ".join(kept) + "."
        expected = ["lostFact"]
        note = f"в описании потерян факт «{facts[-1]}»"
    elif variant == "addressLookalike":
        street = street_of(ticket)
        similar = lookalike_street(street) if street else None
        if similar is None:
            return None
        draft["address"].update({"formal": str(ticket.get("address")).replace(street.name, similar.name), "street": similar.name, "source": "manual"})
        expected = ["addressLookalike"]
        note = f"похожая улица: «{similar.name}» вместо «{street.name}»"
    elif variant == "missingSign":
        if ticket.get("victims") and int((ticket.get("victims") or {}).get("count") or 0) > 0:
            draft["what"]["casualties"]["injured"] = False
            note = "не выставлен флаг «Пострадавшие», хотя по билету есть пострадавшие"
        elif len(draft["what"]["signs"]) >= 2:
            dropped = draft["what"]["signs"].pop()
            note = f"не выставлен признак «{dropped}»"
        else:
            return None
        expected = ["missingSign"]
    elif variant == "phoneMismatch":
        digits = "".join(ch for ch in str((ticket.get("caller") or {}).get("phone") or "") if ch.isdigit())
        if len(digits) < 10:
            return None
        changed = digits[:-1] + str((int(digits[-1]) + 1) % 10)
        draft["phones"]["provided"] = format_phone(changed)
        expected = ["phoneMismatch"]
        note = "последняя цифра телефона заявителя записана неверно"
    elif variant == "answerTimeout":
        answer_sec = rng.randint(40, 75)
        expected = ["answerTimeout"]
        note = f"вызов принят через {answer_sec} с (норматив 30 с)"
    elif variant == "typos":
        draft["description"], grammar_errors = apply_typos(draft["description"], 2)
        if grammar_errors < 2:
            return None
        expected = ["grammarLimitExceeded"]
        note = f"опечаток в описании: {grammar_errors} (допустимо 1)"
    attempt = base_attempt(index, ticket, draft, rng, answer_sec=answer_sec)
    return {"id": f"op-{index:03d}", "name": variant, "note": note, "attempt": attempt, "ticket": copy.deepcopy(ticket), "expectedErrors": expected, "expectedGrammarErrors": grammar_errors, "expertScore": EXPERT[variant]}


def build(out_dir: Path = OUT_DIR, minimum: int = 30) -> list[Path]:
    cards, entries, reference = load_inputs()
    rng = random.Random(SEED)
    tickets = [c for c in cards if eligible(c, entries, reference)]
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    counts: dict[str, int] = {}
    index = 1
    for ticket in tickets:
        for variant in VARIANTS:
            if counts.get(variant, 0) >= PER_VARIANT_LIMIT.get(variant, 10**6):
                continue
            doc = make_variant(variant, index, ticket, entries, reference, rng)
            if doc is None:
                continue
            counts[variant] = counts.get(variant, 0) + 1
            path = out_dir / f"op-{index:03d}-{variant}.json"
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            written.append(path)
            index += 1
    if len(written) < minimum:
        raise SystemExit(f"собрано {len(written)} карточек, нужно ≥ {minimum}")
    return written


def main() -> int:
    paths = build()
    print(f"{len(paths)} карточек → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
