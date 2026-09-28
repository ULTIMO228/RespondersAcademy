"""Серверные сессии: в БД хранится хеш случайного jti, а не токен."""

from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_user_active", "user_id", "revoked_at"),)

    jti_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    issued_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    expires_at: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    revoked_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
