"""Проверка единого SanitizedTicket gate."""

from __future__ import annotations

import pytest

from ml.source_gate import SourceGateError, approved_source


def _source(**updates: object) -> dict[str, object]:
    return {
        "source_ticket_id": "ticket-0042",
        "situation_no": 2,
        "sanitized_text": "Сильный ветер повалил дерево на проезжую часть",
        "source_hash": "a" * 64,
        "reviewer_id": "u-002",
        "reviewed_at": "2026-09-24T10:00:00+00:00",
        "pii_check": "passed",
        "approved": True,
        "raw_source_path": "/private/quarantine/source.pdf",
        **updates,
    }


def test_разрешённый_источник_возвращает_только_очищенную_проекцию() -> None:
    source = approved_source(_source())

    assert source.source_ticket_id == "ticket-0042"
    assert source.situation_no == 2
    assert source.sanitized_text == "Сильный ветер повалил дерево на проезжую часть"
    assert not hasattr(source, "raw_source_path")


@pytest.mark.parametrize(
    "updates",
    [
        {"pii_check": "pending"},
        {"approved": False},
        {"reviewer_id": ""},
        {"source_hash": "bad-hash"},
        {"sanitized_text": "  "},
        {"situation_no": True},
    ],
)
def test_gate_отклоняет_непрошедший_проверку_источник(updates: dict[str, object]) -> None:
    with pytest.raises(SourceGateError):
        approved_source(_source(**updates))
