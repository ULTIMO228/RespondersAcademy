from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(16), index=True)
    arm_number: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    service: Mapped[str | None] = mapped_column(String(160), nullable=True)
    assigned_groups: Mapped[list[str] | None] = mapped_column(JSONVariant, nullable=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    def to_public(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "login": self.login,
            "fullName": self.full_name,
            "role": self.role,
            "armNumber": self.arm_number,
            "isActive": self.is_active,
        }
        if self.group:
            data["group"] = self.group
        if self.service:
            data["service"] = self.service
        if self.assigned_groups:
            data["assignedGroups"] = list(self.assigned_groups)
        return data
