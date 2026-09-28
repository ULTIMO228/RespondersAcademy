"""Строгие Pydantic-схемы расширения ai-workflow/1."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, ConfigDict, Field, StrictBool, field_validator, model_validator

from app.schemas.common import ApiModel

SchemaVersion = Literal["ai-workflow/1"]
Mode = Literal["operator112", "dds"]
ScenarioSourceKind = Literal["ticket", "template", "llm", "student_card"]
ScenarioApproval = Literal["draft", "validation_failed", "pending_review", "approved", "rejected"]
ScenarioValidation = Literal["pending", "passed", "failed"]
EvaluationStatus = Literal["pending", "preliminary", "review_required", "final"]
ScoreAxis = Literal["timeScore", "correctnessScore", "grammarScore", "semanticScore"]
ErrorSeverity = Literal["critical", "major", "minor"]
ErrorDetector = Literal["rule", "ml", "llm_confirmed", "teacher"]
SemanticDecisionKind = Literal["equivalent", "different", "uncertain"]
FieldDecisionKind = Literal["accepted", "edited", "rejected"]

Score = Annotated[int, Field(strict=True, ge=0, le=100)]
PositiveVersion = Annotated[int, Field(strict=True, ge=1)]
NonNegativeInt = Annotated[int, Field(strict=True, ge=0)]
NonEmptyString = Annotated[str, Field(min_length=1)]
class AIContractModel(ApiModel):
    """Контрактная модель: camelCase на проводе, nullable-поля не теряются при dump()."""

    model_config = ConfigDict(extra="allow", frozen=True)

    def dump(self) -> dict[str, object]:
        return self.model_dump(by_alias=True, mode="json", exclude_unset=True)


class StrictAIContractModel(AIContractModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


RequestId = Annotated[str, Field(min_length=1, max_length=128)]


class ScenarioDraftRequest(StrictAIContractModel):
    mode: Mode
    source_ticket_id: Annotated[str, Field(min_length=1, max_length=64)]
    category: Annotated[str, Field(min_length=1, max_length=160)]
    count: Annotated[int, Field(strict=True, ge=1, le=5)] = 1
    request_id: RequestId


class ScenarioFieldDecisionRequest(StrictAIContractModel):
    field_path: Annotated[str, Field(min_length=1, max_length=256)]
    decision: FieldDecisionKind
    value: object | None = None

    @model_validator(mode="after")
    def _check_value(self) -> Self:
        if self.decision == "edited" and "value" not in self.model_fields_set:
            raise ValueError("Для решения edited укажите value")
        if self.decision != "edited" and "value" in self.model_fields_set:
            raise ValueError("value допустимо только для решения edited")
        return self


class ScenarioReviseRequest(StrictAIContractModel):
    base_version: PositiveVersion
    comment: Annotated[str, Field(max_length=2000)] = ""
    accepted_fields: list[ScenarioFieldDecisionRequest] = Field(min_length=1, max_length=64)
    request_id: RequestId


class ScenarioApproveRequest(StrictAIContractModel):
    version: PositiveVersion
    request_id: RequestId


class CardSnapshot(AIContractModel):
    id: NonEmptyString
    fields: dict[str, object]


class ScenarioVersion(AIContractModel):
    schema_version: SchemaVersion
    scenario_id: NonEmptyString
    version: PositiveVersion
    mode: Mode
    source_ticket_id: NonEmptyString
    source_situation_no: Annotated[int, Field(strict=True, ge=1, le=3)]
    source_kind: ScenarioSourceKind
    source_hash: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    source_attempt_id: NonEmptyString | None = None
    source_card_id: NonEmptyString | None = None
    source_card_version: PositiveVersion | None = None
    parent_version: PositiveVersion | None = None
    teacher_comment: str | None = None
    validation: ScenarioValidation
    approval: ScenarioApproval
    card_snapshot: CardSnapshot
    etalon_version: NonEmptyString
    rule_source_ids: list[NonEmptyString] = Field(min_length=1)
    approved_by: NonEmptyString | None = None

    @model_validator(mode="before")
    @classmethod
    def _drop_internal_creator_claim(cls, value: object) -> object:
        if isinstance(value, dict):
            return {key: item for key, item in value.items() if key not in ("createdBy", "created_by")}
        return value

    @model_validator(mode="after")
    def _check_scenario_rules(self) -> Self:
        optional_non_null = (
            "source_attempt_id",
            "source_card_id",
            "source_card_version",
            "parent_version",
            "teacher_comment",
            "approved_by",
        )
        for name in optional_non_null:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"Поле {name} нельзя передавать как null")
        if len(set(self.rule_source_ids)) != len(self.rule_source_ids):
            raise ValueError("ruleSourceIds должны быть уникальными")
        if self.source_kind == "student_card" and any(
            getattr(self, name) is None
            for name in ("source_attempt_id", "source_card_id", "source_card_version")
        ):
            raise ValueError("Для student_card обязательны sourceAttemptId, sourceCardId и sourceCardVersion")
        if self.approval == "approved" and (self.validation != "passed" or self.approved_by is None):
            raise ValueError("Утверждённый сценарий должен пройти проверку и иметь approvedBy")
        return self


class AttemptEvent(AIContractModel):
    schema_version: SchemaVersion
    id: NonEmptyString
    attempt_id: NonEmptyString
    seq: NonNegativeInt
    mode: Mode
    kind: NonEmptyString
    occurred_at: AwareDatetime
    payload: dict[str, object]
    card_version: PositiveVersion
    source_scenario_version: PositiveVersion | None = None

    @model_validator(mode="after")
    def _reject_null_optional_version(self) -> Self:
        if "source_scenario_version" in self.model_fields_set and self.source_scenario_version is None:
            raise ValueError("sourceScenarioVersion нельзя передавать как null")
        return self


class ErrorRecord(StrictAIContractModel):
    id: NonEmptyString
    attempt_id: NonEmptyString
    mode: Mode
    rule_id: NonEmptyString
    type: NonEmptyString
    severity: ErrorSeverity
    evidence_key: NonEmptyString
    field_path: str | None = None
    event_id: str | None = None
    observed: str
    expected: str | None = None
    source_ref: NonEmptyString
    detector: ErrorDetector
    etalon_version: NonEmptyString
    assessor_version: str | None = None
    fixed: StrictBool | None = None
    created_at: AwareDatetime
    teacher_id: str | None = None

    @model_validator(mode="after")
    def _reject_null_optional_values(self) -> Self:
        optional_non_null = (
            "field_path",
            "event_id",
            "expected",
            "assessor_version",
            "fixed",
            "teacher_id",
        )
        for name in optional_non_null:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"Поле {name} нельзя передавать как null")
        return self


class EvaluationAxes(StrictAIContractModel):
    time_score: Score | None = Field(...)
    correctness_score: Score | None = Field(...)
    grammar_score: Score | None = Field(...)
    semantic_score: Score | None = Field(...)


class EvaluationRevision(AIContractModel):
    schema_version: SchemaVersion
    attempt_id: NonEmptyString
    mode: Mode
    status: EvaluationStatus
    revision: PositiveVersion
    available_axes: list[ScoreAxis]
    total_score: Score | None = None
    etalon_version: NonEmptyString
    assessor_version: NonEmptyString
    model_release_id: str | None = Field(...)
    errors: list[ErrorRecord]
    axes: EvaluationAxes
    created_at: AwareDatetime
    reason_code: NonEmptyString | None = None

    @model_validator(mode="after")
    def _check_evaluation_rules(self) -> Self:
        if len(set(self.available_axes)) != len(self.available_axes):
            raise ValueError("availableAxes должны быть уникальными")
        if "reason_code" in self.model_fields_set and self.reason_code is None:
            raise ValueError("reasonCode нельзя передавать как null")
        score_is_present = "total_score" in self.model_fields_set
        if self.status in ("pending", "review_required"):
            if score_is_present:
                raise ValueError("Для pending/review_required totalScore должен отсутствовать")
            return self
        if not score_is_present or self.total_score is None:
            raise ValueError("Для preliminary/final требуется totalScore")
        if not self.available_axes:
            raise ValueError("totalScore нельзя указывать без определённых осей")
        axes = self.axes.model_dump()
        axis_keys = {
            "timeScore": "time_score",
            "correctnessScore": "correctness_score",
            "grammarScore": "grammar_score",
            "semanticScore": "semantic_score",
        }
        if any(axes[axis_keys[axis]] is None for axis in self.available_axes):
            raise ValueError("totalScore допустим только при определённых применимых осях")
        return self


class ModeBreakdown(StrictAIContractModel):
    operator112: NonNegativeInt
    dds: NonNegativeInt


class SessionReport(AIContractModel):
    schema_version: SchemaVersion
    session_id: NonEmptyString
    generated_at: AwareDatetime
    attempt_ids: list[str]
    error_counts: dict[str, NonNegativeInt]
    review_pending_count: NonNegativeInt
    mode_breakdown: ModeBreakdown
    effective_scores: dict[str, Score]
    error_record_ids: list[NonEmptyString]

    @model_validator(mode="after")
    def _check_unique_ids(self) -> Self:
        if len(set(self.attempt_ids)) != len(self.attempt_ids):
            raise ValueError("attemptIds должны быть уникальными")
        if len(set(self.error_record_ids)) != len(self.error_record_ids):
            raise ValueError("errorRecordIds должны быть уникальными")
        return self


class PaginatedErrorRecordsResponse(StrictAIContractModel):
    schema_version: SchemaVersion = "ai-workflow/1"
    session_id: NonEmptyString
    items: list[ErrorRecord]
    next_cursor: str | None = None
    total: NonNegativeInt


class SessionErrorSummaryResponse(StrictAIContractModel):
    schema_version: SchemaVersion = "ai-workflow/1"
    session_id: NonEmptyString
    total_errors: NonNegativeInt
    by_type: dict[str, NonNegativeInt]
    by_mode: ModeBreakdown
    by_severity: dict[str, NonNegativeInt]
    by_student: dict[str, NonNegativeInt]
    error_record_ids: list[NonEmptyString]


class StudentAttemptErrorsItem(StrictAIContractModel):
    attempt_id: NonEmptyString
    card_id: NonEmptyString
    mode: Mode
    errors: list[ErrorRecord]


class StudentErrorsResponse(StrictAIContractModel):
    schema_version: SchemaVersion = "ai-workflow/1"
    student_id: NonEmptyString
    attempts: list[StudentAttemptErrorsItem]
    total_errors: NonNegativeInt


class SemanticDecision(StrictAIContractModel):
    decision: SemanticDecisionKind
    reference_fact_ids: list[NonEmptyString] = Field(max_length=12)
    missing_fact_ids: list[NonEmptyString] | None = Field(default=None, max_length=12)
    explanation: Annotated[str, Field(min_length=1, max_length=500)]
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("confidence", mode="before")
    @classmethod
    def _reject_boolean_confidence(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("confidence должно быть числом от 0 до 1")
        return value

    @model_validator(mode="after")
    def _check_semantic_lists(self) -> Self:
        if "missing_fact_ids" in self.model_fields_set and self.missing_fact_ids is None:
            raise ValueError("missingFactIds нельзя передавать как null")
        if "confidence" in self.model_fields_set and self.confidence is None:
            raise ValueError("confidence нельзя передавать как null")
        if len(set(self.reference_fact_ids)) != len(self.reference_fact_ids):
            raise ValueError("referenceFactIds должны быть уникальными")
        if self.missing_fact_ids is not None and len(set(self.missing_fact_ids)) != len(self.missing_fact_ids):
            raise ValueError("missingFactIds должны быть уникальными")
        return self


class AssessmentStateResponse(AIContractModel):
    attempt_id: NonEmptyString
    mode: Mode
    status: EvaluationStatus
    revision: PositiveVersion
    available_axes: list[ScoreAxis]
    axes: EvaluationAxes
    total_score: Score | None = None
    reason_code: NonEmptyString | None = None
    updated_at: AwareDatetime


class SemanticReviewResponseItem(AIContractModel):
    id: NonEmptyString
    attempt_id: NonEmptyString
    field_path: NonEmptyString
    reference_fact_ids: list[NonEmptyString]
    reason: str
    base_similarity: float | None = None
    threshold_version: NonEmptyString
    decision: SemanticDecisionKind
    explanation: str
    model_release_id: str | None = None
    validated_at: AwareDatetime | None = None


class AssessmentReviewResponse(AIContractModel):
    attempt_id: NonEmptyString
    mode: Mode
    status: EvaluationStatus
    revision: PositiveVersion
    available_axes: list[ScoreAxis]
    axes: EvaluationAxes
    total_score: Score | None = None
    etalon_version: NonEmptyString
    assessor_version: NonEmptyString
    model_release_id: str | None = None
    semantic_reviews: list[SemanticReviewResponseItem]
    error_records: list[ErrorRecord]
    teacher_override: dict[str, object] | None = None
    updated_at: AwareDatetime


class SemanticArbitrationDecision(StrictAIContractModel):
    review_id: NonEmptyString
    decision: SemanticDecisionKind
    comment: str | None = None


class AssessmentResolveRequest(StrictAIContractModel):
    expected_revision: PositiveVersion
    score: Score
    comment: Annotated[str, Field(min_length=1, max_length=2000)]
    semantic_decisions: list[SemanticArbitrationDecision] = Field(default_factory=list)
    request_id: RequestId
