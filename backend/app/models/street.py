from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Street(Base):
    """Справочник улиц Москвы (R3, FR-014): сид из `backend/data/streets/moscow_streets.json` (OSM, ODbL)."""

    __tablename__ = "streets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name_norm: Mapped[str] = mapped_column(String(200), index=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(32), default="")
    okrug: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raion: Mapped[str | None] = mapped_column(String(80), nullable=True)

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {"id": self.id, "name": self.name, "type": self.type}
        if self.okrug:
            data["okrug"] = self.okrug
        if self.raion:
            data["raion"] = self.raion
        return data
