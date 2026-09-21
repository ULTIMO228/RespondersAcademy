from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class ReferenceEntry(Base):
    """Справочники reference.json по ключам (ddsStatuses, services, …) + classifierMeta."""

    __tablename__ = "reference"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONVariant)


class SystemSettings(Base):
    """Настройки раздела «Система» (одна строка id=1), секции — JSON как в mocks/admin/system-settings.json."""

    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
