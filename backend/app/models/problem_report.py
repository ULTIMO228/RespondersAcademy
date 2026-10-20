"""Сообщение обучающегося преподавателю «Сообщить о проблеме» (спека 009, US6; data-model.md, ProblemReport).

Текст и необязательное изображение (png/jpeg ≤ 2 МБ). Файл лежит на диске под `var/`, в таблице — путь относительно
`var/` (`uploads/problem-reports/<id>.<ext>`), чтобы путь был переносим между окружениями. Видимость — группы
преподавателя (см. `problem_report_service`), поэтому группа в таблице не хранится: она берётся у обучающегося.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProblemReport(Base):
    __tablename__ = "problem_reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # pr-NNN
    student_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    attempt_id: Mapped[str | None] = mapped_column(String(16), nullable=True)  # попытка 112, если отправлено из карточки
    incident_number: Mapped[int | None] = mapped_column(Integer, nullable=True)  # «Происшествие» в окне
    text: Mapped[str] = mapped_column(String(2000))
    attachment_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), index=True)
    read_at: Mapped[str | None] = mapped_column(String(32), nullable=True)  # преподаватель открыл/отметил
