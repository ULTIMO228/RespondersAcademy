"""Timed information about response crews, tied to one DDS attempt."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkMessage(Base):
    __tablename__ = "card_work_messages"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    at: Mapped[str] = mapped_column(String(32), index=True)
    expected_status: Mapped[str] = mapped_column(String(24))

    def to_contract(self) -> dict[str, str]:
        return {"id": self.id, "kind": self.kind, "at": self.at, "expectedStatus": self.expected_status}
