from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class ClassifierEntry(Base):
    __tablename__ = "classifier_entries"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    group: Mapped[str] = mapped_column(String(160), index=True)
    sign1: Mapped[str] = mapped_column(String(160), default="")
    sign2: Mapped[str] = mapped_column(String(160), default="")
    sign3: Mapped[str] = mapped_column(String(160), default="")
    extra_signs: Mapped[str] = mapped_column(String(400), default="")
    final_type: Mapped[str] = mapped_column(String(400))
    ekp35_type: Mapped[str] = mapped_column(String(400), default="")
    main_service: Mapped[str] = mapped_column(String(64), default="")
    notifications: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)

    def to_contract(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "group": self.group,
            "sign1": self.sign1,
            "sign2": self.sign2,
            "sign3": self.sign3,
            "extraSigns": self.extra_signs,
            "finalType": self.final_type,
            "ekp35Type": self.ekp35_type,
            "mainService": self.main_service,
            "notifications": list(self.notifications or []),
        }
