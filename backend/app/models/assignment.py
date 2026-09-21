from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant

ASSIGNMENT_STATES = ("active", "finished")
ASSIGNMENT_ATTEMPT_STATES = ("ringing", "answered", "submitted")


class Assignment(Base):
    """Задание лобби (Assignment контракта v1, asg-NNN; FR-030, FR-044). Модель — Phase 10, API — Phase 12 (US5-B)."""

    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    teacher_id: Mapped[str] = mapped_column(String(16), index=True)
    student_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    training_mode: Mapped[str] = mapped_column(String(16), default="operator112")  # dds | operator112 | chain
    format: Mapped[str] = mapped_column(String(16), default="training")  # training | exam
    card_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    random_rule: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant, nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)  # norms, hints, passThreshold, timeLimitSec, maxGrammarErrors
    due_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    state: Mapped[str] = mapped_column(String(16), default="active", index=True)
    created_at: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200), default="")

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "teacherId": self.teacher_id,
            "studentIds": list(self.student_ids or []),
            "trainingMode": self.training_mode,
            "format": self.format,
            "cardIds": list(self.card_ids or []),
            "params": dict(self.params or {}),
            "state": self.state,
            "createdAt": self.created_at,
            "title": self.title,
        }
        if self.random_rule:
            data["randomRule"] = dict(self.random_rule)
        if self.due_at:
            data["dueAt"] = self.due_at
        return data


class AssignmentAttempt(Base):
    """Связь попытки с заданием: число прослушиваний, подсказок, состояние и результат экзамена."""

    __tablename__ = "assignment_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assignment_id: Mapped[str] = mapped_column(String(16), index=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    card_id: Mapped[str] = mapped_column(String(16))
    attempt_id: Mapped[str] = mapped_column(String(16), index=True, unique=True)
    replays: Mapped[int] = mapped_column(Integer, default=0)
    hints_shown: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(String(16), default="ringing")
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
