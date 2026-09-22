"""Контракт заданий и экзамена (`/api/v1/assignments`, T090)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

TrainingMode = Literal["dds", "operator112", "chain"]
AssignmentFormat = Literal["training", "exam"]


class RandomRule(ApiModel):
    groups: list[str] = Field(default_factory=list)
    difficulty: list[int] = Field(default_factory=list)
    count: int = 1

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, value: list[int]) -> list[int]:
        if any(isinstance(v, bool) or not 1 <= v <= 5 for v in value):
            raise ValueError("Сложность билета — от 1 до 5")
        return value

    @field_validator("count")
    @classmethod
    def _count(cls, value: int) -> int:
        if isinstance(value, bool) or not 1 <= value <= 100:
            raise ValueError("Количество случайных билетов — от 1 до 100")
        return value


class AssignmentCreateRequest(ApiModel):
    student_ids: list[str]
    training_mode: TrainingMode
    format: AssignmentFormat
    card_ids: list[str] = Field(default_factory=list)
    random_rule: RandomRule | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    due_at: str | None = None
    title: str = ""

    @model_validator(mode="after")
    def _selection(self) -> AssignmentCreateRequest:
        self.student_ids = list(dict.fromkeys(v.strip() for v in self.student_ids if v.strip()))
        self.card_ids = list(dict.fromkeys(v.strip() for v in self.card_ids if v.strip()))
        if not self.student_ids:
            raise ValueError("Выберите хотя бы одного обучающегося")
        if bool(self.card_ids) == bool(self.random_rule):
            raise ValueError("Укажите либо cardIds, либо randomRule")
        threshold = self.params.get("passThreshold")
        if threshold is not None and (isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not 0 <= threshold <= 100):
            raise ValueError("Порог экзамена — число от 0 до 100")
        limit = self.params.get("timeLimitSec")
        if limit is not None and (isinstance(limit, bool) or not isinstance(limit, int) or limit <= 0):
            raise ValueError("Лимит времени — положительное целое число секунд")
        if self.format == "exam":
            self.params = {**self.params, "hints": {**(self.params.get("hints") or {}), "enabled": False}}
        return self


class Assignment(ApiModel):
    id: str
    teacher_id: str
    student_ids: list[str]
    training_mode: TrainingMode
    format: AssignmentFormat
    card_ids: list[str]
    params: dict[str, Any]
    state: str
    created_at: str
    title: str = ""
    random_rule: dict[str, Any] | None = None
    due_at: str | None = None


class AssignmentProgress(ApiModel):
    student_id: str
    card_id: str
    state: str
    attempt_id: str
    score: int | None = None
    passed: bool | None = None


class AssignmentDetail(Assignment):
    progress: list[AssignmentProgress] = Field(default_factory=list)


class AssignmentStartRequest(ApiModel):
    student_id: str | None = None


class StartResponse(ApiModel):
    attempt: dict[str, Any]
