"""Размеченные билеты для валидатора: `backend/data/labeled/tickets/*.json` (T056/T087, SC-005).

20 корректных билетов — карточки `spec/mocks/cards.json` без объявленных дублей, чей адрес найден в справочнике
улиц точно либо лежит в другом регионе (`crossRegion`); 20 дефектных — те же карточки с ровно одним внесённым
дефектом по одному из шести критериев валидатора (по кругу): `wrongCategory` (группа другой службы),
`unknownStreet` (несуществующая улица), `missingField` (пустой телефон заявителя / службы), `duplicate`
(копия другой карточки без `duplicateOf`), `typo` (опечатка из типового списка), `inconsistent` (факт фабулы против
признака). Детерминировано, без сети. Запуск: `uv run python -m ml.scripts.build_labeled_tickets`.
"""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.config import get_settings
from ml.generate.validator import VICTIMS_MENTION, VICTIMS_NEGATION
from ml.nlp import address as address_nlp

OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "tickets"
CORRECT_COUNT = 20
DEFECT_KINDS = ("wrongCategory", "unknownStreet", "missingField", "duplicate", "typo", "inconsistent")
DEFECT_CHECK = {"wrongCategory": "category", "unknownStreet": "address", "missingField": "requiredFields", "duplicate": "duplicate", "typo": "grammar", "inconsistent": "consistency"}
# Группы-«антиподы» для подмены категории: заведомо другой профиль, чем у любой карточки выборки.
WRONG_GROUPS = ("Радиация", "пожар в метро", "Угон транспорта", "Социальная помощь", "Тонет, на льдине")
UNKNOWN_STREET = "ул. Несуществующая"
TYPOS = (("пострадавших", "пострадавщих"), ("человек", "чиловек"), ("мужчина", "мущина"), ("женщина", "женшина"), ("квартира", "квортира"), ("возгорание", "возгарание"), ("задымление", "задымленние"), ("автомашина", "афтомашина"), ("ребёнок", "ребенак"), ("сознании", "сазнании"), ("травма", "траума"), ("горит", "гарит"), ("дерутся", "дерутца"), ("запах", "запох"), ("пропал", "прапал"))


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def correct_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    picked: list[dict[str, Any]] = []
    for card in cards:
        if card.get("duplicateOf"):
            continue
        if not card.get("crossRegion") and not address_nlp.match(str(card["address"])).exact:
            continue
        picked.append(card)
        if len(picked) == CORRECT_COUNT:
            break
    return picked


def inject_typo(summary: str) -> tuple[str, str] | None:
    lowered = summary.lower()
    for correct, wrong in TYPOS:
        index = lowered.find(correct)
        if index >= 0:
            original = summary[index : index + len(correct)]
            replaced = wrong[:1].upper() + wrong[1:] if original[:1].isupper() else wrong
            return summary[:index] + replaced + summary[index + len(correct) :], f"«{original}» → «{replaced}»"
    return None


def make_defect(kind: str, card: dict[str, Any], pool: list[dict[str, Any]], index: int) -> tuple[dict[str, Any], str] | None:
    ticket = deepcopy(card)
    if kind == "wrongCategory":
        wrong = next(g for g in WRONG_GROUPS if g != card["group"])
        ticket["group"] = wrong
        return ticket, f"группа «{card['group']}» заменена на «{wrong}»"
    if kind == "unknownStreet":
        if card.get("crossRegion"):
            return None
        ticket["address"] = f"Москва, {UNKNOWN_STREET}, {7 + index}"
        ticket.pop("addressRefined", None)
        return ticket, f"адрес заменён на несуществующую улицу «{UNKNOWN_STREET}»"
    if kind == "missingField":
        if index % 2:
            ticket["caller"] = {**ticket["caller"], "phone": ""}
            return ticket, "пустой телефон заявителя"
        ticket["expectedServices"] = []
        return ticket, "пустой список ожидаемых служб"
    if kind == "duplicate":
        donor = pool[(index + 7) % len(pool)]
        if donor["id"] == card["id"]:
            donor = pool[(index + 8) % len(pool)]
        ticket["summary"], ticket["address"] = donor["summary"], donor["address"]
        ticket["addressRefined"] = donor.get("addressRefined") or ""
        ticket.pop("duplicateOf", None)
        if not ticket["addressRefined"]:
            del ticket["addressRefined"]
        return ticket, f"фабула и адрес скопированы из {donor['id']} без duplicateOf"
    if kind == "typo":
        injected = inject_typo(card["summary"])
        if injected is None:
            return None
        ticket["summary"], note = injected
        return ticket, f"опечатка {note}"
    if kind == "inconsistent":
        if card.get("victims") and VICTIMS_MENTION.search(card["summary"]) and not VICTIMS_NEGATION.search(card["summary"]):
            ticket.pop("victims")
            return ticket, "признак victims снят при пострадавших в фабуле"
        if card.get("crossRegion"):
            ticket["crossRegion"] = False
            return ticket, "признак crossRegion снят при адресе в другой области"
        ticket["summary"] = card["summary"] + ", 03 не требуется"
        ticket.pop("noAmbulance", None)
        return ticket, "в фабулу добавлено «03 не требуется» без признака noAmbulance"
    return None


def build() -> list[dict[str, Any]]:
    cards = read_json(get_settings().seed_dir / "spec" / "mocks" / "cards.json")["cards"]
    correct = correct_cards(cards)
    docs: list[dict[str, Any]] = []
    for index, card in enumerate(correct):
        docs.append({"id": f"tk-{index + 1:03d}", "kind": "correct", "defect": None, "expectedFailed": [], "sourceCardId": card["id"], "note": "исходная карточка билета", "ticket": deepcopy(card)})
    kinds = list(DEFECT_KINDS)
    position = 0
    for index, card in enumerate(correct):
        for _ in range(len(kinds)):
            kind = kinds[position % len(kinds)]
            position += 1
            made = make_defect(kind, card, correct, index)
            if made is not None:
                ticket, note = made
                ticket["id"] = f"tk-{CORRECT_COUNT + index + 1:03d}"
                docs.append({"id": ticket["id"], "kind": "defective", "defect": kind, "expectedFailed": [DEFECT_CHECK[kind]], "sourceCardId": card["id"], "note": note, "ticket": ticket})
                break
    return docs


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("tk-*.json"):
        old.unlink()
    docs = build()
    for doc in docs:
        suffix = doc["defect"] or "correct"
        (OUT_DIR / f"{doc['id']}-{suffix}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    kinds = {d["defect"] for d in docs if d["defect"]}
    print(f"{OUT_DIR}: {len(docs)} билетов ({sum(d['kind'] == 'correct' for d in docs)} корректных, дефекты: {', '.join(sorted(kinds))})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
