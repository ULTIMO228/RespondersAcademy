"""Задачи и версии AI-оценки, семантические решения и канонический реестр ошибок."""

from __future__ import annotations

from typing import Any

from sqlalchemy import DDL, Boolean, CheckConstraint, Index, Integer, String, UniqueConstraint, event, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant

ACTIVE_ASSESSMENT_JOB_STATES = ("queued", "running")
AI_MODES = ("operator112", "dds")
EVALUATION_STATUSES = ("pending", "preliminary", "review_required", "final")
SCORE_AXES = ("timeScore", "correctnessScore", "grammarScore", "semanticScore")


class AssessmentJob(Base):
    """Идемпотентная задача второго эшелона на базовую ревизию попытки."""

    __tablename__ = "ai_assessment_jobs"
    __table_args__ = (
        CheckConstraint("base_revision >= 1", name="ck_ai_assessment_job_revision_positive"),
        CheckConstraint("state IN ('queued', 'running', 'completed', 'failed')", name="ck_ai_assessment_job_state"),
        Index(
            "uq_ai_assessment_job_active_attempt_revision",
            "attempt_id",
            "base_revision",
            unique=True,
            sqlite_where=text("state IN ('queued', 'running')"),
            postgresql_where=text("state IN ('queued', 'running')"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    state: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    base_revision: Mapped[int] = mapped_column(Integer)
    queued_at: Mapped[str] = mapped_column(String(32))
    completed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    @property
    def is_active(self) -> bool:
        return self.state in ACTIVE_ASSESSMENT_JOB_STATES


class EvaluationRevision(Base):
    """Неизменяемый результат одной ревизии оценки; неизвестные оси остаются null."""

    __tablename__ = "ai_evaluation_revisions"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="ck_ai_evaluation_revision_positive"),
        CheckConstraint("mode IN ('operator112', 'dds')", name="ck_ai_evaluation_mode"),
        CheckConstraint(
            "status IN ('pending', 'preliminary', 'review_required', 'final')",
            name="ck_ai_evaluation_status",
        ),
        CheckConstraint(
            "(status IN ('pending', 'review_required') AND total_score IS NULL) OR "
            "(status IN ('preliminary', 'final') AND total_score IS NOT NULL)",
            name="ck_ai_evaluation_total_score_status",
        ),
        CheckConstraint(
            "total_score IS NULL OR total_score BETWEEN 0 AND 100",
            name="ck_ai_evaluation_total_score_range",
        ),
    )

    attempt_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    available_axes: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    axes: Mapped[dict[str, int | None]] = mapped_column(
        JSONVariant,
        default=lambda: {axis: None for axis in SCORE_AXES},
    )
    total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    etalon_version: Mapped[str] = mapped_column(String(64))
    assessor_version: Mapped[str] = mapped_column(String(64))
    model_release_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    teacher_override: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32))

    def has_scoreable_axes(self) -> bool:
        """A score is valid only when each applicable axis has a concrete value."""
        return bool(self.available_axes) and all(
            axis in self.axes and self.axes[axis] is not None for axis in self.available_axes
        )


def _validate_evaluation_revision(target: EvaluationRevision) -> None:
    if set(target.axes or {}) != set(SCORE_AXES):
        raise ValueError("Оценка должна содержать все четыре оси")
    if len(set(target.available_axes or [])) != len(target.available_axes or []):
        raise ValueError("Применимые оси оценки должны быть уникальными")
    if any(axis not in SCORE_AXES for axis in target.available_axes or []):
        raise ValueError("Оценка содержит неизвестную ось")
    if any(
        value is not None and (type(value) is not int or not 0 <= value <= 100)
        for value in (target.axes or {}).values()
    ):
        raise ValueError("Значения осей должны быть целыми числами от 0 до 100 или null")

    if target.status in ("pending", "review_required"):
        if target.total_score is not None:
            raise ValueError("Для pending/review_required totalScore должен отсутствовать")
        return
    if target.status not in ("preliminary", "final"):
        raise ValueError("Неизвестный статус оценки")
    if type(target.total_score) is not int or not 0 <= target.total_score <= 100:
        raise ValueError("Для preliminary/final требуется целый totalScore от 0 до 100")
    if not target.has_scoreable_axes():
        raise ValueError("totalScore допустим только при определённых применимых осях")


@event.listens_for(EvaluationRevision, "before_insert")
def _guard_evaluation_revision(mapper: object, connection: object, target: EvaluationRevision) -> None:
    del mapper, connection
    _validate_evaluation_revision(target)


@event.listens_for(EvaluationRevision, "before_update")
@event.listens_for(EvaluationRevision, "before_delete")
def _prevent_evaluation_revision_mutation(mapper: object, connection: object, target: EvaluationRevision) -> None:
    del mapper, connection, target
    raise ValueError("Ревизия оценки неизменяема; создайте новую ревизию")


SQLITE_EVALUATION_INSERT_GUARD = """
CREATE TRIGGER IF NOT EXISTS trg_ai_evaluation_revision_validate_insert
BEFORE INSERT ON ai_evaluation_revisions
WHEN
    COALESCE(json_type(NEW.axes), 'missing') != 'object'
    OR COALESCE(json_type(NEW.available_axes), 'missing') != 'array'
    OR (SELECT COUNT(*) FROM json_each(NEW.axes)) != 4
    OR COALESCE(json_type(NEW.axes, '$.timeScore'), 'missing') NOT IN ('integer', 'null')
    OR COALESCE(json_type(NEW.axes, '$.correctnessScore'), 'missing') NOT IN ('integer', 'null')
    OR COALESCE(json_type(NEW.axes, '$.grammarScore'), 'missing') NOT IN ('integer', 'null')
    OR COALESCE(json_type(NEW.axes, '$.semanticScore'), 'missing') NOT IN ('integer', 'null')
    OR (json_type(NEW.axes, '$.timeScore') = 'integer' AND json_extract(NEW.axes, '$.timeScore') NOT BETWEEN 0 AND 100)
    OR (json_type(NEW.axes, '$.correctnessScore') = 'integer' AND json_extract(NEW.axes, '$.correctnessScore') NOT BETWEEN 0 AND 100)
    OR (json_type(NEW.axes, '$.grammarScore') = 'integer' AND json_extract(NEW.axes, '$.grammarScore') NOT BETWEEN 0 AND 100)
    OR (json_type(NEW.axes, '$.semanticScore') = 'integer' AND json_extract(NEW.axes, '$.semanticScore') NOT BETWEEN 0 AND 100)
    OR (NEW.total_score IS NOT NULL AND NEW.total_score NOT BETWEEN 0 AND 100)
    OR (NEW.status IN ('pending', 'review_required') AND NEW.total_score IS NOT NULL)
    OR (NEW.status IN ('preliminary', 'final') AND (NEW.total_score IS NULL OR json_array_length(NEW.available_axes) = 0))
    OR EXISTS (
        SELECT 1 FROM json_each(NEW.available_axes) AS axis
        WHERE axis.type != 'text' OR axis.value NOT IN ('timeScore', 'correctnessScore', 'grammarScore', 'semanticScore')
    )
    OR EXISTS (
        SELECT 1 FROM json_each(NEW.available_axes) AS axis
        WHERE (axis.value = 'timeScore' AND COALESCE(json_type(NEW.axes, '$.timeScore'), 'missing') != 'integer')
           OR (axis.value = 'correctnessScore' AND COALESCE(json_type(NEW.axes, '$.correctnessScore'), 'missing') != 'integer')
           OR (axis.value = 'grammarScore' AND COALESCE(json_type(NEW.axes, '$.grammarScore'), 'missing') != 'integer')
           OR (axis.value = 'semanticScore' AND COALESCE(json_type(NEW.axes, '$.semanticScore'), 'missing') != 'integer')
    )
    OR (SELECT COUNT(*) FROM json_each(NEW.available_axes))
       != (SELECT COUNT(DISTINCT value) FROM json_each(NEW.available_axes))
BEGIN
    SELECT RAISE(ABORT, 'invalid evaluation axes or score');
END
"""
SQLITE_EVALUATION_UPDATE_GUARD = """
CREATE TRIGGER IF NOT EXISTS trg_ai_evaluation_revision_no_update
BEFORE UPDATE ON ai_evaluation_revisions
BEGIN SELECT RAISE(ABORT, 'evaluation revision is immutable'); END
"""
SQLITE_EVALUATION_DELETE_GUARD = """
CREATE TRIGGER IF NOT EXISTS trg_ai_evaluation_revision_no_delete
BEFORE DELETE ON ai_evaluation_revisions
BEGIN SELECT RAISE(ABORT, 'evaluation revision is immutable'); END
"""


POSTGRES_EVALUATION_GUARD_FUNCTION = (
    "CREATE OR REPLACE FUNCTION guard_ai_evaluation_revision() RETURNS trigger AS $$ "
    "DECLARE axis_name text; axis_type text; axis_value text; axis_count integer; distinct_count integer; "
    "BEGIN "
    "IF TG_OP = 'INSERT' THEN "
    "IF jsonb_typeof(NEW.axes) IS DISTINCT FROM 'object' "
    "OR jsonb_typeof(NEW.available_axes) IS DISTINCT FROM 'array' "
    "THEN RAISE EXCEPTION 'invalid evaluation axes'; END IF; "
    "SELECT count(*) INTO axis_count FROM jsonb_object_keys(NEW.axes); "
    "IF axis_count <> 4 "
    "OR NOT (NEW.axes ?& ARRAY['timeScore', 'correctnessScore', 'grammarScore', 'semanticScore']) "
    "THEN RAISE EXCEPTION 'invalid evaluation axes'; END IF; "
    "SELECT count(*) INTO axis_count FROM jsonb_array_elements_text(NEW.available_axes) AS axes(axis_value); "
    "SELECT count(DISTINCT axes.axis_value) INTO distinct_count "
    "FROM jsonb_array_elements_text(NEW.available_axes) AS axes(axis_value); "
    "IF axis_count <> distinct_count THEN RAISE EXCEPTION 'duplicate available evaluation axes'; END IF; "
    "FOR axis_name IN SELECT jsonb_array_elements_text(NEW.available_axes) LOOP "
    "IF axis_name IS NULL OR axis_name NOT IN ('timeScore', 'correctnessScore', 'grammarScore', 'semanticScore') "
    "THEN RAISE EXCEPTION 'unknown available evaluation axis'; END IF; END LOOP; "
    "FOR axis_name IN SELECT unnest(ARRAY['timeScore', 'correctnessScore', 'grammarScore', 'semanticScore']) LOOP "
    "axis_type := COALESCE(jsonb_typeof(NEW.axes -> axis_name), 'missing'); "
    "IF axis_type = 'number' THEN axis_value := NEW.axes ->> axis_name; "
    "IF axis_value !~ '^(0|[1-9][0-9]*)$' OR axis_value::integer NOT BETWEEN 0 AND 100 "
    "THEN RAISE EXCEPTION 'invalid evaluation axis score'; END IF; "
    "ELSIF axis_type <> 'null' THEN RAISE EXCEPTION 'missing or invalid evaluation axis'; END IF; END LOOP; "
    "IF NEW.status IN ('pending', 'review_required') AND NEW.total_score IS NOT NULL "
    "THEN RAISE EXCEPTION 'score is not available'; END IF; "
    "IF NEW.status IN ('preliminary', 'final') AND (NEW.total_score IS NULL OR NEW.total_score NOT BETWEEN 0 AND 100 "
    "OR jsonb_array_length(NEW.available_axes) = 0) THEN RAISE EXCEPTION 'total score requires available axes'; END IF; "
    "FOR axis_name IN SELECT jsonb_array_elements_text(NEW.available_axes) LOOP "
    "IF jsonb_typeof(NEW.axes -> axis_name) <> 'number' THEN RAISE EXCEPTION 'applicable axis is unresolved'; END IF; END LOOP; "
    "RETURN NEW; END IF; "
    "RAISE EXCEPTION 'evaluation revision is immutable'; END; $$ LANGUAGE plpgsql"
)
POSTGRES_EVALUATION_GUARD_TRIGGER = (
    "CREATE TRIGGER trg_ai_evaluation_revision_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_evaluation_revisions "
    "FOR EACH ROW EXECUTE FUNCTION guard_ai_evaluation_revision()"
)


def install_ai_assessment_guards(connection: Connection) -> None:
    """Idempotently upgrades SQLite databases created before the guards were added."""
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql(SQLITE_EVALUATION_INSERT_GUARD)
        connection.exec_driver_sql(SQLITE_EVALUATION_UPDATE_GUARD)
        connection.exec_driver_sql(SQLITE_EVALUATION_DELETE_GUARD)


event.listen(
    EvaluationRevision.__table__,
    "after_create",
    DDL(SQLITE_EVALUATION_INSERT_GUARD).execute_if(dialect="sqlite"),
)
event.listen(
    EvaluationRevision.__table__,
    "after_create",
    DDL(SQLITE_EVALUATION_UPDATE_GUARD).execute_if(dialect="sqlite"),
)
event.listen(
    EvaluationRevision.__table__,
    "after_create",
    DDL(SQLITE_EVALUATION_DELETE_GUARD).execute_if(dialect="sqlite"),
)
event.listen(
    EvaluationRevision.__table__,
    "after_create",
    DDL(POSTGRES_EVALUATION_GUARD_FUNCTION).execute_if(dialect="postgresql"),
)
event.listen(
    EvaluationRevision.__table__,
    "after_create",
    DDL(POSTGRES_EVALUATION_GUARD_TRIGGER).execute_if(dialect="postgresql"),
)


class SemanticReview(Base):
    """Проверяемый ответ второго эшелона по конкретному смысловому полю."""

    __tablename__ = "ai_semantic_reviews"
    __table_args__ = (
        CheckConstraint("decision IN ('equivalent', 'different', 'uncertain')", name="ck_ai_semantic_decision"),
        CheckConstraint(
            "base_similarity IS NULL OR (base_similarity >= 0 AND base_similarity <= 1)",
            name="ck_ai_semantic_similarity_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    field_path: Mapped[str] = mapped_column(String(256))
    reference_fact_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    reason: Mapped[str] = mapped_column(String(2000))
    base_similarity: Mapped[float | None] = mapped_column(nullable=True)
    threshold_version: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(16), index=True)
    explanation: Mapped[str] = mapped_column(String(500))
    model_release_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    validated_at: Mapped[str | None] = mapped_column(String(32), nullable=True)


class ErrorRecord(Base):
    """Одна подтверждённая причина ошибки с устойчивым ключом доказательства."""

    __tablename__ = "ai_error_records"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "rule_id",
            "evidence_key",
            "etalon_version",
            name="uq_ai_error_attempt_rule_evidence_etalon",
        ),
        CheckConstraint("mode IN ('operator112', 'dds')", name="ck_ai_error_mode"),
        CheckConstraint("severity IN ('critical', 'major', 'minor')", name="ck_ai_error_severity"),
        CheckConstraint("detector IN ('rule', 'ml', 'llm_confirmed', 'teacher')", name="ck_ai_error_detector"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    mode: Mapped[str] = mapped_column(String(16), index=True)
    rule_id: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    evidence_key: Mapped[str] = mapped_column(String(256))
    field_path: Mapped[str | None] = mapped_column(String(256), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    observed: Mapped[str] = mapped_column(String(2000))
    expected: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    source_ref: Mapped[str] = mapped_column(String(256))
    detector: Mapped[str] = mapped_column(String(24))
    etalon_version: Mapped[str] = mapped_column(String(64), index=True)
    assessor_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(32), index=True)
    teacher_id: Mapped[str | None] = mapped_column(String(16), nullable=True)

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "attemptId": self.attempt_id,
            "mode": self.mode,
            "ruleId": self.rule_id,
            "type": self.type,
            "severity": self.severity,
            "evidenceKey": self.evidence_key,
            "observed": self.observed,
            "sourceRef": self.source_ref,
            "detector": self.detector,
            "etalonVersion": self.etalon_version,
            "createdAt": self.created_at,
        }
        if self.field_path:
            data["fieldPath"] = self.field_path
        if self.event_id:
            data["eventId"] = self.event_id
        if self.expected:
            data["expected"] = self.expected
        if self.assessor_version:
            data["assessorVersion"] = self.assessor_version
        if self.fixed:
            data["fixed"] = True
        if self.teacher_id:
            data["teacherId"] = self.teacher_id
        return data
