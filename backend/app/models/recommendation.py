from __future__ import annotations

from typing import Any

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(400))
    reason: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    created_at: Mapped[str] = mapped_column(String(32))
    accepted_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def to_contract(self) -> dict[str, Any]:
        data = {"id": self.id, "kind": self.kind, "targetId": self.target_id, "title": self.title,
                "reason": dict(self.reason), "createdAt": self.created_at}
        if self.accepted_at:
            data["acceptedAt"] = self.accepted_at
        return data


class StudentRating(Base):
    __tablename__ = "student_ratings"

    student_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), primary_key=True)
    rating: Mapped[float] = mapped_column(Float, default=1000.0)
    history: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    weak_groups: Mapped[dict[str, float]] = mapped_column(JSONVariant, default=dict)
