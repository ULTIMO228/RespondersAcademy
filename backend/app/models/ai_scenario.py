"""Версии AI-сценариев, решения преподавателя и очищенные источники."""

from __future__ import annotations

from typing import Any

from sqlalchemy import DDL, Boolean, CheckConstraint, Integer, String, Text, UniqueConstraint, event, inspect
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import set_committed_value

from app.db.base import Base, JSONVariant

APPROVED_SCENARIO = "approved"
PASSED_VALIDATION = "passed"


class _FrozenDict(dict[str, Any]):
    """JSON-serializable immutable mapping used by approved scenario snapshots."""

    @staticmethod
    def _immutable(*args: object, **kwargs: object) -> None:
        del args, kwargs
        raise TypeError("Утверждённый снимок сценария неизменяем")

    __setitem__ = _immutable
    __delitem__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable


def _freeze_json(value: Any) -> Any:
    if isinstance(value, dict):
        return _FrozenDict({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze_json(item) for item in value)
    return value


class ScenarioVersion(Base):
    """Неизменяемый снимок версии сценария и её эталона."""

    __tablename__ = "ai_scenario_versions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_ai_scenario_version_positive"),
        CheckConstraint("mode IN ('operator112', 'dds')", name="ck_ai_scenario_mode"),
        CheckConstraint("source_kind IN ('ticket', 'template', 'llm', 'student_card')", name="ck_ai_scenario_source_kind"),
        CheckConstraint("validation IN ('pending', 'passed', 'failed')", name="ck_ai_scenario_validation"),
        CheckConstraint(
            "approval IN ('draft', 'validation_failed', 'pending_review', 'approved', 'rejected')",
            name="ck_ai_scenario_approval",
        ),
        CheckConstraint("source_situation_no BETWEEN 1 AND 3", name="ck_ai_scenario_situation_range"),
        CheckConstraint("length(source_hash) = 64", name="ck_ai_scenario_source_hash_length"),
        CheckConstraint(
            "approval != 'approved' OR (validation = 'passed' AND approved_by IS NOT NULL)",
            name="ck_ai_scenario_approved_is_validated",
        ),
        CheckConstraint(
            "source_kind != 'student_card' OR (source_attempt_id IS NOT NULL AND source_card_id IS NOT NULL AND source_card_version IS NOT NULL)",
            name="ck_ai_scenario_student_card_provenance",
        ),
    )

    scenario_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), index=True)
    source_ticket_id: Mapped[str] = mapped_column(String(64), index=True)
    created_by: Mapped[str] = mapped_column(String(16), index=True)
    source_situation_no: Mapped[int] = mapped_column(Integer)
    source_kind: Mapped[str] = mapped_column(String(24))
    source_hash: Mapped[str] = mapped_column(String(64))
    source_attempt_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    source_card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_card_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parent_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    teacher_comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    validation: Mapped[str] = mapped_column(String(24), index=True)
    validation_report: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    approval: Mapped[str] = mapped_column(String(24), index=True)
    card_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    etalon_version: Mapped[str] = mapped_column(String(64), index=True)
    rule_source_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    approved_by: Mapped[str | None] = mapped_column(String(16), nullable=True)

    @property
    def available_for_training(self) -> bool:
        return self.approval == APPROVED_SCENARIO and self.validation == PASSED_VALIDATION


@event.listens_for(ScenarioVersion, "before_update")
def _prevent_approved_scenario_version_update(mapper: object, connection: object, target: ScenarioVersion) -> None:
    """Разрешает переход к approved, но запрещает любые последующие правки версии."""
    del mapper, connection
    state = inspect(target)
    if not state.session or not state.session.is_modified(target, include_collections=True):
        return
    previous_approval = state.attrs.approval.history.deleted
    was_approved = bool(previous_approval and previous_approval[0] == APPROVED_SCENARIO)
    unchanged_approved = not state.attrs.approval.history.has_changes() and target.approval == APPROVED_SCENARIO
    if was_approved or unchanged_approved:
        raise ValueError("Утверждённая версия сценария неизменяема")


@event.listens_for(ScenarioVersion.card_snapshot, "set", retval=True)
def _freeze_approved_card_snapshot(target: ScenarioVersion, value: Any, old_value: Any, initiator: object) -> Any:
    del old_value, initiator
    return _freeze_json(value) if target.approval == APPROVED_SCENARIO else value


@event.listens_for(ScenarioVersion.rule_source_ids, "set", retval=True)
def _freeze_approved_rule_sources(target: ScenarioVersion, value: Any, old_value: Any, initiator: object) -> Any:
    del old_value, initiator
    return _freeze_json(value) if target.approval == APPROVED_SCENARIO else value


@event.listens_for(ScenarioVersion, "load")
def _freeze_loaded_approved_scenario(target: ScenarioVersion, context: object) -> None:
    del context
    if target.approval == APPROVED_SCENARIO:
        set_committed_value(target, "card_snapshot", _freeze_json(target.card_snapshot))
        set_committed_value(target, "rule_source_ids", _freeze_json(target.rule_source_ids))


@event.listens_for(ScenarioVersion.approval, "set", retval=True)
def _freeze_scenario_on_approval(target: ScenarioVersion, value: str, old_value: str, initiator: object) -> str:
    del old_value, initiator
    if value == APPROVED_SCENARIO:
        # Keep SQLAlchemy's old/new history so edits made in the same flush are persisted.
        target.card_snapshot = _freeze_json(target.card_snapshot)
        target.rule_source_ids = _freeze_json(target.rule_source_ids)
    return value


SQLITE_SCENARIO_UPDATE_GUARD = (
    "CREATE TRIGGER IF NOT EXISTS trg_ai_scenario_no_update_approved "
    "BEFORE UPDATE ON ai_scenario_versions WHEN OLD.approval = 'approved' "
    "BEGIN SELECT RAISE(ABORT, 'approved scenario version is immutable'); END"
)
SQLITE_SCENARIO_DELETE_GUARD = (
    "CREATE TRIGGER IF NOT EXISTS trg_ai_scenario_no_delete_approved "
    "BEFORE DELETE ON ai_scenario_versions WHEN OLD.approval = 'approved' "
    "BEGIN SELECT RAISE(ABORT, 'approved scenario version is immutable'); END"
)


def install_ai_scenario_guards(connection: Connection) -> None:
    """Idempotently upgrades SQLite databases created before the guards were added."""
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql(SQLITE_SCENARIO_UPDATE_GUARD)
        connection.exec_driver_sql(SQLITE_SCENARIO_DELETE_GUARD)
    install_ai_etalon_guards(connection)


event.listen(ScenarioVersion.__table__, "after_create", DDL(SQLITE_SCENARIO_UPDATE_GUARD).execute_if(dialect="sqlite"))
event.listen(ScenarioVersion.__table__, "after_create", DDL(SQLITE_SCENARIO_DELETE_GUARD).execute_if(dialect="sqlite"))
event.listen(
    ScenarioVersion.__table__,
    "after_create",
    DDL(
        "CREATE OR REPLACE FUNCTION guard_ai_scenario_version() RETURNS trigger AS $$ "
        "BEGIN IF OLD.approval = 'approved' THEN RAISE EXCEPTION 'approved scenario version is immutable'; "
        "END IF; IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql"
    ).execute_if(dialect="postgresql"),
)
event.listen(
    ScenarioVersion.__table__,
    "after_create",
    DDL(
        "CREATE TRIGGER trg_ai_scenario_immutable BEFORE UPDATE OR DELETE ON ai_scenario_versions "
        "FOR EACH ROW EXECUTE FUNCTION guard_ai_scenario_version()"
    ).execute_if(dialect="postgresql"),
)


class EtalonVersion(Base):
    """Версия проверяемого эталона с происхождением обязательных фактов."""

    __tablename__ = "ai_etalon_versions"
    __table_args__ = (CheckConstraint("mode IN ('operator112', 'dds')", name="ck_ai_etalon_mode"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(String(32), index=True)
    mode: Mapped[str] = mapped_column(String(16), index=True)
    expected_fields: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    expected_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    semantic_facts: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    rule_source_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    classifier_version: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[str] = mapped_column(String(32))


SQLITE_ETALON_UPDATE_GUARD = (
    "CREATE TRIGGER IF NOT EXISTS trg_ai_etalon_no_update_approved "
    "BEFORE UPDATE ON ai_etalon_versions WHEN EXISTS ("
    "SELECT 1 FROM ai_scenario_versions WHERE etalon_version = OLD.id AND approval = 'approved') "
    "BEGIN SELECT RAISE(ABORT, 'approved etalon version is immutable'); END"
)
SQLITE_ETALON_DELETE_GUARD = (
    "CREATE TRIGGER IF NOT EXISTS trg_ai_etalon_no_delete_approved "
    "BEFORE DELETE ON ai_etalon_versions WHEN EXISTS ("
    "SELECT 1 FROM ai_scenario_versions WHERE etalon_version = OLD.id AND approval = 'approved') "
    "BEGIN SELECT RAISE(ABORT, 'approved etalon version is immutable'); END"
)


def install_ai_etalon_guards(connection: Connection) -> None:
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql(SQLITE_ETALON_UPDATE_GUARD)
        connection.exec_driver_sql(SQLITE_ETALON_DELETE_GUARD)


event.listen(EtalonVersion.__table__, "after_create", DDL(SQLITE_ETALON_UPDATE_GUARD).execute_if(dialect="sqlite"))
event.listen(EtalonVersion.__table__, "after_create", DDL(SQLITE_ETALON_DELETE_GUARD).execute_if(dialect="sqlite"))
event.listen(
    EtalonVersion.__table__,
    "after_create",
    DDL(
        "CREATE OR REPLACE FUNCTION guard_ai_etalon_version() RETURNS trigger AS $$ "
        "BEGIN IF EXISTS (SELECT 1 FROM ai_scenario_versions WHERE etalon_version = OLD.id AND approval = 'approved') "
        "THEN RAISE EXCEPTION 'approved etalon version is immutable'; END IF; "
        "IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql"
    ).execute_if(dialect="postgresql"),
)
event.listen(
    EtalonVersion.__table__,
    "after_create",
    DDL(
        "CREATE TRIGGER trg_ai_etalon_immutable BEFORE UPDATE OR DELETE ON ai_etalon_versions "
        "FOR EACH ROW EXECUTE FUNCTION guard_ai_etalon_version()"
    ).execute_if(dialect="postgresql"),
)


class DraftFieldDecision(Base):
    """Решение преподавателя по одному полю версии сценария."""

    __tablename__ = "ai_draft_field_decisions"
    __table_args__ = (
        UniqueConstraint("scenario_id", "scenario_version", "field_path", name="uq_ai_field_decision_per_version"),
        CheckConstraint("decision IN ('accepted', 'edited', 'rejected')", name="ck_ai_field_decision_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[str] = mapped_column(String(32), index=True)
    scenario_version: Mapped[int] = mapped_column(Integer)
    field_path: Mapped[str] = mapped_column(String(256))
    decision: Mapped[str] = mapped_column(String(16))
    value: Mapped[Any | None] = mapped_column(JSONVariant, nullable=True)
    teacher_id: Mapped[str] = mapped_column(String(16), index=True)
    at: Mapped[str] = mapped_column(String(32))
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class SanitizedTicket(Base):
    """Реестр только проверенных человеком и очищенных ситуаций источника."""

    __tablename__ = "ai_sanitized_tickets"
    __table_args__ = (
        CheckConstraint("situation_no BETWEEN 1 AND 3", name="ck_ai_sanitized_situation_range"),
        CheckConstraint("pii_check = 'passed'", name="ck_ai_sanitized_pii_passed"),
        CheckConstraint("length(source_hash) = 64", name="ck_ai_sanitized_source_hash_length"),
        CheckConstraint("approved IS TRUE", name="ck_ai_sanitized_ticket_approved"),
        CheckConstraint("length(reviewer_id) > 0", name="ck_ai_sanitized_reviewer_required"),
        CheckConstraint("length(reviewed_at) > 0", name="ck_ai_sanitized_review_time_required"),
    )

    source_ticket_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    situation_no: Mapped[int] = mapped_column(Integer, primary_key=True)
    sanitized_text: Mapped[str] = mapped_column(Text)
    pii_check: Mapped[str] = mapped_column(String(16), default="passed")
    reviewer_id: Mapped[str] = mapped_column(String(16))
    reviewed_at: Mapped[str] = mapped_column(String(32))
    source_hash: Mapped[str] = mapped_column(String(64))
    approved: Mapped[bool] = mapped_column(Boolean, default=True)


class AIRequest(Base):
    """Идемпотентный ответ сценарного API, ограниченный автором и операцией."""

    __tablename__ = "ai_scenario_requests"
    __table_args__ = (UniqueConstraint("actor_id", "operation", "request_id", name="uq_ai_scenario_request_actor_operation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(16), index=True)
    operation: Mapped[str] = mapped_column(String(24), index=True)
    request_id: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[Any | None] = mapped_column(JSONVariant, nullable=True)
