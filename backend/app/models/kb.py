from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class KbArticle(Base):
    """Статья справочника, построенная из классификатора и учебных билетов."""

    __tablename__ = "kb_articles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    group: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    sections: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    updated_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def to_contract(self) -> dict[str, Any]:
        return {"id": self.id, "group": self.group, "title": self.title, "sections": dict(self.sections or {}),
                "updatedBy": self.updated_by, "updatedAt": self.updated_at}
