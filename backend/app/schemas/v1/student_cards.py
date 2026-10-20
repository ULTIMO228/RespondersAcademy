"""Контракт банка карточек обучающихся-112 (`/api/v1/student-cards`, фича 011)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ApiModel

StudentCardDecision = Literal["accepted", "notAccepted"]


class StudentCardEtalon(ApiModel):
    """Эталон ДДС карточки обучающегося: первичный статус и, для «Не принята», кому передать."""

    card_id: str = Field(min_length=1)
    expected_decision: StudentCardDecision
    expected_transfer_to: str | None = None

    @model_validator(mode="after")
    def _transfer(self) -> StudentCardEtalon:
        self.card_id = self.card_id.strip()
        target = (self.expected_transfer_to or "").strip()
        if self.expected_decision == "notAccepted" and not target:
            raise ValueError("Для «Не принята» укажите, кому передана информация")
        self.expected_transfer_to = target if self.expected_decision == "notAccepted" else None
        return self


class StudentCard(ApiModel):
    id: str
    group: str
    summary: str
    address: str
    author_id: str
    author_name: str
    author_group: str | None = None
    registered_at: str | None = None
    source_card_id: str | None = None
    selected_services: list[str]
    ticket_services: list[str]
    proposed: StudentCardEtalon
