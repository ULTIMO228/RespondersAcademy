from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class Scenario(Base):
    """Учебный сценарий (Scenario контракта, s-NNN): документ + индексируемые колонки."""

    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    title: Mapped[str] = mapped_column(String(400))
    level: Mapped[str] = mapped_column(String(16))
    difficulty: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(16), index=True)
    validation_status: Mapped[str] = mapped_column(String(16), index=True)
    card_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    doc: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_report: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    history: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    updated_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def to_contract(self) -> dict[str, Any]:
        return dict(self.doc)

    def sync_columns(self) -> None:
        """Индексируемые колонки — из документа (после правок doc)."""
        self.title = self.doc.get("title", "")
        self.level = self.doc.get("level", "beginner")
        self.difficulty = int(self.doc.get("difficulty", 1))
        self.source = self.doc.get("source", "template")
        self.validation_status = (self.doc.get("validation") or {}).get("status", "draft")
        self.card_ids = list(self.doc.get("cardIds") or [])
