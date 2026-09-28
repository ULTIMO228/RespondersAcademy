"""Счётчики неудачных входов для нескольких процессов приложения."""

from __future__ import annotations

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthThrottle(Base):
    __tablename__ = "auth_throttles"

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[int] = mapped_column(BigInteger, nullable=False)
    failures: Mapped[int] = mapped_column(Integer, nullable=False)
    blocked_until: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
