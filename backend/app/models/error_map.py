"""Вердикты преподавателя по пояснениям карты ошибок (фича 003, US6; data-model.md §2)."""

from __future__ import annotations

from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ERROR_MAP_MODES = ("operator112", "dds")
ERROR_MAP_VERDICTS = ("agree", "disagree")


class ErrorMapVerdict(Base):
    """«Согласен / Не согласен» преподавателя с пояснением этапа: одна актуальная запись на ключ.

    Ключ — `(teacher_id, group_id, student_id, mode, stage_id, text_hash)`: вердикт относится к конкретному
    тексту пояснения, а не к периоду, поэтому `period` в ключ не входит и хранит последний использованный период.
    `student_id` — NOT NULL с пустой строкой для карты группы: NULL в уникальном индексе SQLite и PostgreSQL считаются
    разными значениями, и дубли вердиктов по группе не отсекались бы. Повторный выбор обновляет вердикт; прежнее
    значение остаётся в журнале аудита (`error_map.verdict`).
    """

    __tablename__ = "error_map_verdicts"
    __table_args__ = (
        CheckConstraint("mode IN ('operator112', 'dds')", name="ck_error_map_verdict_mode"),
        CheckConstraint("verdict IN ('agree', 'disagree')", name="ck_error_map_verdict_value"),
        UniqueConstraint(
            "teacher_id", "group_id", "student_id", "mode", "stage_id", "text_hash", name="uq_error_map_verdict_target"
        ),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # emv-NNN
    teacher_id: Mapped[str] = mapped_column(String(16), index=True)
    group_id: Mapped[str] = mapped_column(String(64), index=True)
    student_id: Mapped[str] = mapped_column(String(16), default="", server_default="")  # '' — вердикт по группе
    mode: Mapped[str] = mapped_column(String(16))
    stage_id: Mapped[str] = mapped_column(String(32))
    period: Mapped[str] = mapped_column(String(8))
    source: Mapped[str] = mapped_column(String(12))  # ai | template
    text_hash: Mapped[str] = mapped_column(String(64))
    verdict: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[str] = mapped_column(String(32))
