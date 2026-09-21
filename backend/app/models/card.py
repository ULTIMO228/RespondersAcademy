from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class IncidentCard(Base):
    """Учебная карточка (IncidentCard, c-NNN): билет + эталон; плюс карточки, сформированные обучаемыми."""

    __tablename__ = "incident_cards"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    ticket_no: Mapped[int] = mapped_column(Integer)
    situation_no: Mapped[int] = mapped_column(Integer)
    group: Mapped[str] = mapped_column(String(160), index=True)
    summary: Mapped[str] = mapped_column(String(2000))
    address: Mapped[str] = mapped_column(String(600))
    address_refined: Mapped[str | None] = mapped_column(String(600), nullable=True)
    caller: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    victims: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    no_ambulance: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cross_region: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    expected_services: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    expected_tags: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    duplicate_of: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_by_student_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    mode_origin: Mapped[str] = mapped_column(String(16), default="seed")
    source_attempt_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "ticketNo": self.ticket_no,
            "situationNo": self.situation_no,
            "group": self.group,
            "summary": self.summary,
            "address": self.address,
            "caller": dict(self.caller),
            "expectedServices": list(self.expected_services or []),
            "expectedTags": list(self.expected_tags or []),
        }
        if self.address_refined:
            data["addressRefined"] = self.address_refined
        if self.victims:
            data["victims"] = dict(self.victims)
        if self.no_ambulance is not None:
            data["noAmbulance"] = self.no_ambulance
        if self.cross_region is not None:
            data["crossRegion"] = self.cross_region
        if self.duplicate_of:
            data["duplicateOf"] = self.duplicate_of
        if self.created_by_student_id:
            data["createdByStudentId"] = self.created_by_student_id
        if self.extra:
            data.update(self.extra)
        return data


class ArmCardFixture(Base):
    """UI-фикстура рабочей карточки ПОВ-112 (card-NNNNNN). Хранится целиком как JSON контракта."""

    __tablename__ = "arm_card_fixtures"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(32))
    card_status: Mapped[str] = mapped_column(String(24))
    classifier_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    doc: Mapped[dict[str, Any]] = mapped_column(JSONVariant)

    def to_contract(self) -> dict[str, Any]:
        return dict(self.doc)


class CardRuntime(Base):
    """Мутации карточки в тренажёре (статусы ДДС, отработки, напоминания, SMS) — бывший store мок-слоя."""

    __tablename__ = "card_runtime"

    card_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    status_events: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    work_lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    reminders: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    sms: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_contract(self) -> dict[str, Any]:
        return {
            "statusEvents": list(self.status_events or []),
            "workLines": list(self.work_lines or []),
            "reminders": list(self.reminders or []),
            "sms": list(self.sms or []),
        }


class Address(Base):
    """Справочник адресов mocks/local/addresses.json (подсказки адресного блока)."""

    __tablename__ = "addresses"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    doc: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
