"""Раздел «Система» администратора (T067): сервисы, системные журналы, статичные ряды мониторинга/статистики.

`system_settings` уже живёт в `app/models/reference.py` (используется политикой входа) — не дублируется.
Сервисы — состояние в БД (start/stop/restart меняют `state`/`uptime_sec`, процессами не управляют — как мок,
21-admin-system.md «честно о моке»); `system_static` хранит `monitoring` и `usageStats` из `mocks/admin/`.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class SystemService(Base):
    __tablename__ = "system_services"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(16), default="running")  # running | stopped | degraded
    uptime_sec: Mapped[int] = mapped_column(Integer, default=0)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(String(400), default="")
    started_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)  # порядок плиток как в сиде

    def to_contract(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "state": self.state, "uptimeSec": self.uptime_sec, "critical": self.critical, "description": self.description}


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    at: Mapped[str] = mapped_column(String(32), index=True)
    level: Mapped[str] = mapped_column(String(8), index=True)  # INFO | WARN | ERROR
    source: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(String(1000))

    def to_contract(self) -> dict[str, Any]:
        return {"id": self.id, "at": self.at, "level": self.level, "source": self.source, "message": self.message}


class SystemStatic(Base):
    """Статичные документы админки: `monitoring` (ряды за 24 ч), `usageStats` (периоды), `integrity` сида."""

    __tablename__ = "system_static"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONVariant)
