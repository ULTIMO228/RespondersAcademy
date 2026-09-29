"""Секрет подписи обязателен для любого режима запуска."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_jwt_secret_is_required_and_rejects_known_placeholders(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

    for weak in ("short", "change-me-in-production"):
        monkeypatch.setenv("JWT_SECRET", weak)
        with pytest.raises(ValidationError):
            Settings(_env_file=None)
