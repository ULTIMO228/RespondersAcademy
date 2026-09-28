"""Модуль санитизации данных и контроля PII (T037).

Гарантия: ни один генератор, модель или этап конвейера не получает
необработанный скан или непроверенный текст. Допускаются только билеты
с pii_check="passed" и подтверждением преподавателя (approved=True).
"""

from __future__ import annotations

from typing import Any

from ml.source_gate import ApprovedSource, approved_source


def validate_sanitized_ticket(record: object | dict[str, Any]) -> ApprovedSource:
    """Проверяет соответствие билета контракту SanitizedTicket.
    
    Бросает SourceGateError, если источник не прошёл деперсонализацию
    или не утверждён преподавателем.
    """
    return approved_source(record)
