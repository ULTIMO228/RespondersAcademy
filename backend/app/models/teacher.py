from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class ProfileMappingRow(Base):
    """Привязка «служба/группа курсантов → профильные группы ЕКП» (ProfileMappingRow контракта)."""

    __tablename__ = "profile_mapping"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile: Mapped[str] = mapped_column(String(160))
    group_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    incident_groups: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    service_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    updated_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def to_contract(self, student_count: int) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "profile": self.profile,
            "incidentGroups": list(self.incident_groups or []),
            "serviceIds": list(self.service_ids or []),
            "studentCount": student_count,
        }
        if self.group_name:
            data["groupName"] = self.group_name
        return data


class TrainingMaterial(Base):
    __tablename__ = "training_materials"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(400))
    format: Mapped[str] = mapped_column(String(8))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str] = mapped_column(String(16))
    uploaded_at: Mapped[str] = mapped_column(String(32))

    def to_contract(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "format": self.format, "sizeBytes": self.size_bytes, "uploadedBy": self.uploaded_by, "uploadedAt": self.uploaded_at}
