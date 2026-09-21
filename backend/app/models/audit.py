from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    at: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(64), index=True)
    details: Mapped[str] = mapped_column(String(2000))
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    operator_arm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "at": self.at,
            "userId": self.user_id or "",
            "role": self.role,
            "action": self.action,
            "details": self.details,
        }
        if self.ip:
            data["ip"] = self.ip
        if self.card_id:
            data["cardId"] = self.card_id
        if self.operator_arm is not None:
            data["operatorArm"] = self.operator_arm
        return data
