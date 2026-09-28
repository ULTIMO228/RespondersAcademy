"""Черновик реестра `SanitizedTicket` из подтверждённых заказчиком карточек (пилот датасета фичи 001).

Источник — `spec/000-фронт/mocks/cards.json`: ФИО/телефоны/адреса в билетах уже обезличены
и подтверждены заказчиком (Q&A в10, `hack/Фронт/МОКИ-ДАННЫЕ.md`). Скрипт не идёт в исходный
скан `hack/Фронт/Источники/...pdf`.

Гейт `backend/ml/source_gate.py` не пропускает запись дальше по конвейеру без `pii_check="passed"`
и `approved=True` — это осознанно решение конкретного человека, а не скрипта. Поэтому по умолчанию
скрипт пишет реестр в статусе "на рассмотрении" (`pii_check="pending"`, `approved=False`,
`reviewer_id=None`); утвердить его можно только явным `--approve <reviewer_id>`.

Запуск:
    uv run python -m ml.scripts.build_sanitized_tickets --tickets 1,2,3,4
    uv run python -m ml.scripts.build_sanitized_tickets --tickets 1,2,3,4 --approve teacher-senior-1
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from ml.dataset.identities import scrub_text, strip_generated_persons
from ml.pipeline.checks import EMAIL_PATTERN, NAME_MARKERS, PHONE_PATTERN

OUT_FILE = Path(__file__).resolve().parents[2] / "data" / "ai_dataset" / "sanitized_tickets.json"


def _pii_scan(text: str) -> list[str]:
    """Та же эвристика, что и `ml.pipeline.checks` для вывода модели — здесь применяется
    к исходному тексту заранее, чтобы дать человеку статус до утверждения, а не после."""
    flags: list[str] = []
    if PHONE_PATTERN.search(text):
        flags.append("похоже на телефон")
    if EMAIL_PATTERN.search(text):
        flags.append("похоже на email")
    if NAME_MARKERS.search(text):
        flags.append("похоже на ФИО")
    return flags


def _cards_root() -> Path:
    return get_settings().seed_dir / "spec" / "000-фронт" / "mocks"


def _read_cards() -> list[dict[str, Any]]:
    path = _cards_root() / "cards.json"
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)["cards"]


def _sanitized_text(card: dict[str, Any]) -> str:
    """Текст для модели: группа, фабула, адрес, признаки — без имени/телефона заявителя.

    ФИО пациентов, даты рождения и госномера из фабулы заменяются сгенерированными (`ml.dataset.identities`).
    """
    tags = ", ".join(card.get("expectedTags", []))
    summary = scrub_text(card["summary"], card["id"])
    return f"{card['group']}: {summary}. Адрес: {card['address']}. Признаки: {tags}."


def _source_hash(ticket_no: int, situation_no: int, sanitized_text: str) -> str:
    payload = f"{ticket_no}:{situation_no}:{sanitized_text}".encode()
    return hashlib.sha256(payload).hexdigest()


def build_draft_registry(ticket_numbers: list[int]) -> list[dict[str, Any]]:
    cards = [c for c in _read_cards() if c["ticketNo"] in ticket_numbers]
    cards.sort(key=lambda c: (c["ticketNo"], c["situationNo"]))

    records: list[dict[str, Any]] = []
    for card in cards:
        text = _sanitized_text(card)
        # ФИО сканируем только по фабуле и без сгенерированных имён; адрес («Бульвар Маршала Рокоссовского») — не ПДн.
        flags = _pii_scan(strip_generated_persons(scrub_text(card["summary"], card["id"])))
        flags += [f for f in _pii_scan(text) if f != "похоже на ФИО" and f not in flags]
        records.append(
            {
                "source_ticket_id": f"ticket-{card['ticketNo']:03d}",
                "situation_no": card["situationNo"],
                "sanitized_text": text,
                "source_hash": _source_hash(card["ticketNo"], card["situationNo"], text),
                "reviewer_id": None,
                "reviewed_at": None,
                "pii_check": "pending",
                "approved": False,
                # Служебные поля — не читаются source_gate.approved_source(), только для трассировки.
                "_card_id": card["id"],
                "_group": card["group"],
                "_review_status": "needs_look" if flags else "clean",
                "_pii_scan_flags": flags,
            }
        )
    return records


def approve_registry(records: list[dict[str, Any]], reviewer_id: str) -> list[dict[str, Any]]:
    reviewed_at = datetime.now(UTC).isoformat()
    approved = []
    for record in records:
        approved.append(
            {
                **record,
                "reviewer_id": reviewer_id,
                "reviewed_at": reviewed_at,
                "pii_check": "passed",
                "approved": True,
            }
        )
    return approved


def keep_existing_approvals(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Сохраняет прежнее утверждение записи, если текст (хеш) не изменился; иначе запись снова «на рассмотрении»."""
    if not OUT_FILE.exists():
        return records
    previous = {
        (r["source_ticket_id"], r["situation_no"]): r for r in json.loads(OUT_FILE.read_text(encoding="utf-8"))
    }
    merged = []
    for record in records:
        old = previous.get((record["source_ticket_id"], record["situation_no"]))
        if old and old.get("approved") is True and old.get("source_hash") == record["source_hash"]:
            merged.append({**record, **{k: old[k] for k in ("reviewer_id", "reviewed_at", "pii_check", "approved")}})
        else:
            merged.append(record)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tickets", required=True, help="Номера билетов через запятую, например 1,2,3,4")
    parser.add_argument(
        "--approve",
        metavar="REVIEWER_ID",
        default=None,
        help="Утвердить реестр от имени указанного проверяющего (pii_check=passed, approved=True)",
    )
    args = parser.parse_args()

    ticket_numbers = [int(x) for x in args.tickets.split(",") if x.strip()]
    records = build_draft_registry(ticket_numbers)

    if args.approve:
        records = approve_registry(records, args.approve)
    else:
        records = keep_existing_approvals(records)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    status = "approved" if args.approve else "pending review"
    print(f"{len(records)} записей ({status}) → {OUT_FILE}")


if __name__ == "__main__":
    main()
