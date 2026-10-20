"""Схемы карты ошибок 1:1 с `src/shared/api/types/error-map.ts` (спека 003, T008).

Контракт — `spec/003-error-map/contracts/error-map-endpoints.md`; правила полей — `data-model.md`.
Опциональные поля TS (`?:`) со значением None не выводятся; обязательные nullable (`… | null`) остаются null,
в том числе во вложенных моделях. Поэтому базовый класс переопределяет `dump()` (без `exclude_none`) и
сериализацию (wrap-сериализатор убирает только опциональные None).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import (
    Field,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
    model_validator,
)

from app.schemas.common import ApiModel

ErrorMapMode = Literal["operator112", "dds"]
ErrorMapPeriod = Literal["2w", "1m", "all"]
StageLevelWord = Literal["rare", "sometimes", "often", "noData"]
StageComparison = Literal["better", "same", "worse"]
ErrorMapSeverity = Literal["critical", "major", "minor"]
ExplanationSource = Literal["cloud", "local", "template", "ai"]  # ai — совместимость со старыми ответами
ExplanationSourceKind = Literal["cloud", "local", "template"]  # legacy-поле в ранее выпущенном контракте
ExplanationVerdictSource = Literal["ai", "template"]  # хранимый контракт вердиктов остаётся совместимым
VerdictKind = Literal["agree", "disagree"]
HeadlineKind = Literal["problems", "clean", "noData"]
ScopeKind = Literal["group", "student"]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_count(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


class ErrorMapModel(ApiModel):
    """camelCase-модель карты ошибок: опциональные поля со значением None опускаются, обязательные — сохраняются."""

    def dump(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)

    @model_serializer(mode="wrap")
    def _drop_absent_optionals(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> dict[str, Any]:
        data = handler(self)
        for name, field in type(self).model_fields.items():
            if field.is_required() or getattr(self, name) is not None:
                continue
            key = (field.serialization_alias or field.alias or name) if info.by_alias else name
            data.pop(key, None)
        return data


class ErrorMapGroup(ErrorMapModel):
    group_id: str
    title: str
    student_count: int


class ErrorMapStage(ErrorMapModel):
    id: str
    order: int
    title: str
    article_id: str | None = None


class ErrorMapStageLevel(ErrorMapModel):
    stage_id: str
    attempts: int
    attempts_with_error: int
    share: float | None
    level: StageLevelWord
    comparison: StageComparison | None = None
    affected_students: int


class ErrorMapScope(ErrorMapModel):
    kind: ScopeKind
    group_id: str
    student_id: str | None = None
    title: str


class ErrorMapHeadline(ErrorMapModel):
    kind: HeadlineKind
    stage_ids: list[str]
    text: str


class ErrorMapResponse(ErrorMapModel):
    scope: ErrorMapScope
    mode: ErrorMapMode
    period: ErrorMapPeriod
    attempts: int
    stages: list[ErrorMapStage]
    levels: list[ErrorMapStageLevel]
    headline: ErrorMapHeadline
    generated_at: str


class ErrorMapStudentRef(ErrorMapModel):
    id: str
    name: str


class ErrorMapTypicalError(ErrorMapModel):
    rule_id: str
    plain_text: str
    severity: ErrorMapSeverity
    student_count: int
    students: list[ErrorMapStudentRef]
    example_attempt_id: str | None = None
    example_session_id: str | None = None


class ErrorMapChainLink(ErrorMapModel):
    from_: str = Field(alias="from")
    to: str
    caption: str


class ErrorMapExplanation(ErrorMapModel):
    text: str
    source: ExplanationSource
    text_hash: str
    verdict: VerdictKind | None = None
    source_kind: ExplanationSourceKind | None = None  # опциональное legacy-поле; новые ответы используют source
    model: str | None = None  # модель, давшая текст (без префикса транспорта); у шаблона нет


class ErrorMapStageDetail(ErrorMapModel):
    stage: ErrorMapStage
    level: ErrorMapStageLevel
    typical_errors: list[ErrorMapTypicalError]
    chain: list[ErrorMapChainLink]
    explanation: ErrorMapExplanation | None


class ErrorMapJournalRow(ErrorMapModel):
    student_id: str
    name: str
    attempts: int
    levels: list[ErrorMapStageLevel]


class ErrorMapJournalResponse(ErrorMapModel):
    mode: ErrorMapMode
    period: ErrorMapPeriod
    group_id: str
    stages: list[ErrorMapStage]
    rows: list[ErrorMapJournalRow]


class ErrorMapVerdictRequest(ErrorMapModel):
    group_id: str
    student_id: str | None = None
    mode: ErrorMapMode
    period: ErrorMapPeriod
    stage_id: str
    text_hash: str
    source: ExplanationVerdictSource
    verdict: VerdictKind


class MyFocusItem(ErrorMapModel):
    stage_id: str
    title: str
    hint: str
    article_id: str | None = None


class MyFocusResponse(ErrorMapModel):
    mode: ErrorMapMode | None
    items: list[MyFocusItem]
    message: str | None = None


class ErrorMapSettings(ErrorMapModel):
    sometimes_from: float
    often_from: float
    min_attempts_group: int
    min_attempts_student: int
    same_band_points: float

    @field_validator("sometimes_from", "often_from", mode="before")
    @classmethod
    def _threshold(cls, value: Any) -> Any:
        if not _is_number(value):
            raise ValueError("Пороги светофора — числа от 0 до 1")
        return value

    @field_validator("min_attempts_group", "min_attempts_student", mode="before")
    @classmethod
    def _min_attempts(cls, value: Any) -> Any:
        if not _is_count(value) or value < 1:
            raise ValueError("Минимум попыток — целое число не меньше 1")
        return value

    @field_validator("same_band_points", mode="before")
    @classmethod
    def _band(cls, value: Any) -> Any:
        if not _is_number(value) or not 0 <= value <= 50:
            raise ValueError("Допуск «как у группы» — от 0 до 50 баллов")
        return value

    @model_validator(mode="after")
    def _order(self) -> ErrorMapSettings:
        if self.sometimes_from <= 0:
            raise ValueError("Порог «иногда» должен быть больше 0")
        if self.sometimes_from >= self.often_from:
            raise ValueError("Порог «часто» должен быть больше порога «иногда»")
        if self.often_from >= 1:
            raise ValueError("Порог «часто» должен быть меньше 1")
        return self
