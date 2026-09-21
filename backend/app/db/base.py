"""Базовые типы SQLAlchemy: JSON-вариант (JSONB в PostgreSQL), декларативная база."""

from __future__ import annotations

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase

# Вложенные структуры контракта фронта хранятся как JSON; в PostgreSQL — JSONB.
JSONVariant = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass
