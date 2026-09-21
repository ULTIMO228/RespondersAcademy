from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant


class Report(Base):
    """Отчёт курсанта по занятию (Report контракта, rep-<хвост sessionId>-<studentId>)."""

    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(32), index=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    generated_at: Mapped[str] = mapped_column(String(32))
    export_formats: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    student: Mapped[dict[str, Any]] = mapped_column(JSONVariant)
    time_metrics: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    grammar_errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, default=list)
    score: Mapped[int] = mapped_column(Integer, default=0)
    charts: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    ai_comment: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    static: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "sessionId": self.session_id,
            "generatedAt": self.generated_at,
            "exportFormats": list(self.export_formats or []),
            "student": dict(self.student),
            "timeMetrics": list(self.time_metrics or []),
            "grammarErrors": list(self.grammar_errors or []),
            "errors": list(self.errors or []),
            "score": self.score,
            "charts": dict(self.charts or {}),
        }
        if self.ai_comment is not None:
            data["aiComment"] = self.ai_comment
        return data


class GroupReport(Base):
    """Групповой свод занятия (GroupReport контракта) — маркер идемпотентности сборки отчёта."""

    __tablename__ = "group_reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    generated_at: Mapped[str] = mapped_column(String(32))
    report_ids: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    group_insights: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    charts: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    static: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_contract(self, report_ids: list[str] | None = None) -> dict[str, Any]:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "generatedAt": self.generated_at,
            "reportIds": list(report_ids if report_ids is not None else (self.report_ids or [])),
            "groupInsights": list(self.group_insights or []),
            "charts": dict(self.charts or {}),
        }


class ReportFeedback(Base):
    """Обратная связь преподавателя по отчёту (ReportFeedback контракта); повтор заменяет запись."""

    __tablename__ = "report_feedback"

    report_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(32), index=True)
    student_id: Mapped[str] = mapped_column(String(16), index=True)
    teacher_id: Mapped[str] = mapped_column(String(16))
    teacher_name: Mapped[str] = mapped_column(String(160), default="")
    text: Mapped[str] = mapped_column(String(4000))
    recommendations: Mapped[list[str]] = mapped_column(JSONVariant, default=list)
    at: Mapped[str] = mapped_column(String(32))

    def to_contract(self) -> dict[str, Any]:
        return {
            "reportId": self.report_id,
            "sessionId": self.session_id,
            "studentId": self.student_id,
            "text": self.text,
            "recommendations": list(self.recommendations or []),
            "at": self.at,
            "by": self.teacher_id,
            "byName": self.teacher_name,
        }


class CalibrationSample(Base):
    """Пример для перекалибровки оценщика (принцип II/III): правка преподавателя или размеченная попытка."""

    __tablename__ = "calibration_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[str] = mapped_column(String(16), index=True)
    source: Mapped[str] = mapped_column(String(16), default="override")  # override | labeled
    payload: Mapped[dict[str, Any]] = mapped_column(JSONVariant, default=dict)
    created_at: Mapped[str] = mapped_column(String(32))
