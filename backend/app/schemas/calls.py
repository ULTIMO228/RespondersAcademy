"""Схемы софтфона B→C 1:1 с `src/shared/api/types/calls.ts` (T065); тексты правил — как в моке `mock/calls.ts`."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import field_validator, model_validator

from app.schemas.common import ApiModel
from app.services.time import is_iso, parse_iso_ms

CallTurn = Literal["answer", "reply"]
Speaker = Literal["dispatcher", "ai"]
SPEAKERS = ("dispatcher", "ai")


class CallReplyRequest(ApiModel):
    to_number: str
    turn: CallTurn
    text: str = ""

    @field_validator("to_number", mode="before")
    @classmethod
    def _number(cls, value: Any) -> Any:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Укажите номер абонента")
        return value.strip()

    @field_validator("turn", mode="before")
    @classmethod
    def _turn(cls, value: Any) -> Any:
        if value not in ("answer", "reply"):
            raise ValueError("Поле «turn» должно быть answer или reply")
        return value

    @field_validator("text", mode="before")
    @classmethod
    def _text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else ""

    @model_validator(mode="after")
    def _reply_needs_text(self) -> CallReplyRequest:
        if self.turn == "reply" and not self.text:
            raise ValueError("Введите реплику диспетчера")
        return self


class TranscriptLine(ApiModel):
    speaker: Speaker
    text: str
    at: str

    @model_validator(mode="before")
    @classmethod
    def _shape(cls, value: Any) -> Any:
        valid = isinstance(value, dict) and value.get("speaker") in SPEAKERS and isinstance(value.get("text"), str) and is_iso(value.get("at"))
        if not valid:
            raise ValueError("Реплика транскрипта: нужны speaker (dispatcher|ai), text, at")
        return value


class CardCallRequest(ApiModel):
    student_id: str
    to_number: str
    started_at: str
    ended_at: str
    transcript: list[TranscriptLine]

    @field_validator("student_id", mode="before")
    @classmethod
    def _student(cls, value: Any) -> Any:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Укажите курсанта (studentId)")
        return value.strip()

    @field_validator("to_number", mode="before")
    @classmethod
    def _number(cls, value: Any) -> Any:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Укажите номер абонента")
        return value.strip()

    @field_validator("started_at", "ended_at", mode="before")
    @classmethod
    def _iso(cls, value: Any, info: Any) -> Any:
        if not is_iso(value):
            key = "startedAt" if info.field_name == "started_at" else "endedAt"
            raise ValueError(f"Поле «{key}» должно быть датой ISO 8601")
        return value

    @field_validator("transcript", mode="before")
    @classmethod
    def _transcript(cls, value: Any) -> Any:
        if not isinstance(value, list):
            raise ValueError("Поле «transcript» должно быть списком реплик")
        return value

    @model_validator(mode="after")
    def _order(self) -> CardCallRequest:
        if parse_iso_ms(self.ended_at) < parse_iso_ms(self.started_at):
            raise ValueError("Вызов не может закончиться до начала")
        return self
