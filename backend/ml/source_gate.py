"""Единый gate: к генерации допускаются только утверждённые очищенные ситуации."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

SOURCE_HASH = re.compile(r"^[a-f0-9]{64}$")


class SourceGateError(ValueError):
    """Источник отсутствует, не очищен или не прошёл человеческое утверждение."""


@dataclass(frozen=True)
class ApprovedSource:
    source_ticket_id: str
    situation_no: int
    sanitized_text: str
    source_hash: str
    reviewer_id: str
    reviewed_at: str


def approved_source(record: object | dict[str, Any]) -> ApprovedSource:
    """Проверяет поля реестра и возвращает только безопасную проекцию без исходного скана."""

    def value(name: str) -> Any:
        if isinstance(record, dict):
            return record.get(name)
        return getattr(record, name, None)

    source_ticket_id = value("source_ticket_id")
    situation_no = value("situation_no")
    sanitized_text = value("sanitized_text")
    source_hash = value("source_hash")
    reviewer_id = value("reviewer_id")
    reviewed_at = value("reviewed_at")
    pii_check = value("pii_check")
    approved = value("approved")

    if not isinstance(source_ticket_id, str) or not source_ticket_id.strip():
        raise SourceGateError("В реестре не указан sourceTicketId")
    if isinstance(situation_no, bool) or not isinstance(situation_no, int) or not 1 <= situation_no <= 3:
        raise SourceGateError("Номер ситуации источника должен быть от 1 до 3")
    if not isinstance(sanitized_text, str) or not sanitized_text.strip():
        raise SourceGateError("Очищенный текст источника пуст")
    if pii_check != "passed" or approved is not True:
        raise SourceGateError("Источник не прошёл очистку и утверждение преподавателем")
    if not isinstance(reviewer_id, str) or not reviewer_id.strip():
        raise SourceGateError("Для источника не зафиксирован проверяющий")
    if not isinstance(reviewed_at, str) or not reviewed_at.strip():
        raise SourceGateError("Для источника не зафиксировано время проверки")
    if not isinstance(source_hash, str) or not SOURCE_HASH.fullmatch(source_hash):
        raise SourceGateError("Хеш источника должен быть SHA-256 в шестнадцатеричном формате")

    return ApprovedSource(
        source_ticket_id=source_ticket_id.strip(),
        situation_no=situation_no,
        sanitized_text=sanitized_text.strip(),
        source_hash=source_hash,
        reviewer_id=reviewer_id,
        reviewed_at=reviewed_at,
    )
