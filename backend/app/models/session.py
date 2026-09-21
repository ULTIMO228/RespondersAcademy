from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class TrainingSession(Base):
    """Занятие (Session контракта, групповой канон ТЗ §10) + план мастера и состояние выдачи."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    teacher_id: Mapped[str] = mapped_column(String(16), index=True)
    student_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    scenario_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    mode: Mapped[str] = mapped_column(String(16), default="practice")
    card_source: Mapped[str] = mapped_column(String(16), default="generated")
    card_flow: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    state: Mapped[str] = mapped_column(String(16), index=True, default="configured")
    started_at: Mapped[str] = mapped_column(String(32))
    finished_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    paused_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    parked: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    training_mode: Mapped[str] = mapped_column(String(16), default="dds")
    format: Mapped[str] = mapped_column(String(16), default="training")
    exam: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)


class Attempt(Base):
    """Попытка курсанта по карточке (CardEvent контракта, att-NNN)."""

    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(32), index=True)
    card_id: Mapped[str] = mapped_column(String(24), index=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    mode: Mapped[str] = mapped_column(String(16), default="dds")
    opened_at: Mapped[str] = mapped_column(String(32))
    primary_reaction_ms: Mapped[int] = mapped_column(Integer, default=0)
    statuses: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    services_called: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    completed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    full_processing_ms: Mapped[int] = mapped_column(Integer, default=0)
    entered_text: Mapped[dict[str, str]] = mapped_column(JSONVariant, default=dict)
    calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    card_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)

    def to_contract(self, evaluation: dict[str, Any] | None = None) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "cardId": self.card_id,
            "studentId": self.student_id,
            "openedAt": self.opened_at,
            "primaryReactionMs": self.primary_reaction_ms,
            "statuses": list(self.statuses or []),
            "servicesCalled": list(self.services_called or []),
            "completedAt": self.completed_at or "",
            "fullProcessingMs": self.full_processing_ms,
            "enteredText": dict(self.entered_text or {}),
            "calls": list(self.calls or []),
        }
        if evaluation is not None:
            data["evaluation"] = evaluation
        return data


class Evaluation(Base):
    """Оценка попытки (Evaluation контракта) + полный результат оценщика в components."""

    __tablename__ = "evaluations"

    attempt_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    assessor_version: Mapped[str] = mapped_column(String(32), default="seed")
    time_score: Mapped[int] = mapped_column(Integer)
    correctness_score: Mapped[int] = mapped_column(Integer)
    grammar_score: Mapped[int] = mapped_column(Integer)
    semantic_score: Mapped[int] = mapped_column(Integer)
    total_score: Mapped[int] = mapped_column(Integer)
    grammar_errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    ai_comment: Mapped[str] = mapped_column(String(4000), default="")
    components: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    generated_at: Mapped[str] = mapped_column(String(32))
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    mode: Mapped[str] = mapped_column(String(16), default="dds")

    def to_contract(self, override: dict[str, Any] | None = None) -> dict[str, Any]:
        data: dict[str, Any] = {
            "timeScore": self.time_score,
            "correctnessScore": self.correctness_score,
            "grammarScore": self.grammar_score,
            "semanticScore": self.semantic_score,
            "totalScore": self.total_score,
            "grammarErrors": list(self.grammar_errors or []),
            "errors": list(self.errors or []),
            "aiComment": self.ai_comment,
        }
        if override:
            data["teacherOverride"] = override
        # Расширения контракта (фронт волны A их игнорирует): режим, версия оценщика, компоненты, предупреждения.
        data["mode"] = self.mode or "dds"
        data["assessorVersion"] = self.assessor_version
        if self.components:
            data["components"] = dict(self.components.get("components") or {})
            data["warnings"] = list(self.components.get("warnings") or [])
        if self.passed is not None:
            data["passed"] = self.passed
        return data


class TeacherOverride(Base):
    __tablename__ = "teacher_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    teacher_id: Mapped[str] = mapped_column(String(16))
    score: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(String(2000))
    at: Mapped[str] = mapped_column(String(32))
    previous_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def to_contract(self) -> dict[str, Any]:
        return {"score": self.score, "comment": self.comment, "at": self.at, "by": self.teacher_id}
