"""Настройки языковой модели и её здоровье (фича 006, data-model.md): по одной строке id=1 в каждой таблице."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

AI_SOURCES = ("local", "cloud")
AI_SERVED_BY = ("cloud", "local", "template")
AI_ERROR_REASONS = (
    "invalid_key",
    "insufficient_funds",
    "rate_limited",
    "daily_limit",
    "timeout",
    "network",
    "wrong_route",
    "bad_response",
    "local_down",
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class AiSettings(Base):
    """Выбранный источник модели и зашифрованный ключ облака. Строки нет — действует окружение (FR-016).

    Модель и маршрут облака здесь не хранятся (константы кода). Шифртекст — Fernet (`app/services/ai_secrets.py`);
    `repr` не показывает ни шифртекст, ни последние символы ключа.
    """

    __tablename__ = "ai_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_ai_settings_single_row"),
        CheckConstraint(_in("source", AI_SOURCES), name="ck_ai_settings_source"),
        CheckConstraint(
            "source <> 'cloud' OR (cloud_key_cipher IS NOT NULL AND cloud_key_cipher <> '')",
            name="ck_ai_settings_cloud_needs_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    source: Mapped[str] = mapped_column(String(8), default="local", server_default="local")
    cloud_key_cipher: Mapped[str | None] = mapped_column(Text, nullable=True)
    cloud_key_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(16), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"AiSettings(source={self.source!r}, key_set={bool(self.cloud_key_cipher)})"


class AiHealth(Base):
    """Последний исход вызова модели и суточные счётчики; состояние ok|degraded|down вычисляется сервисом."""

    __tablename__ = "ai_health"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_ai_health_single_row"),
        CheckConstraint(_in("active_source", AI_SOURCES), name="ck_ai_health_active_source"),
        CheckConstraint(
            f"served_by_last IS NULL OR {_in('served_by_last', AI_SERVED_BY)}", name="ck_ai_health_served_by"
        ),
        CheckConstraint(
            f"last_error_reason IS NULL OR {_in('last_error_reason', AI_ERROR_REASONS)}", name="ck_ai_health_reason"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    active_source: Mapped[str] = mapped_column(String(8))
    served_by_last: Mapped[str | None] = mapped_column(String(8), nullable=True)
    last_ok_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    errors_today: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    calls_today: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    probe_calls_today: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    day: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
