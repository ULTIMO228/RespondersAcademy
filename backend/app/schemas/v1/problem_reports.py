"""Схема ответа «Сообщить о проблеме» (спека 009, US6): camelCase 1:1 с `types/problem-report.ts`.

Путь к файлу вложения наружу не отдаётся: только признак `hasAttachment`; файл — отдельным эндпоинтом преподавателя.
Поля `studentName` и `groupId` добавлены к контракту `ProblemReport`: без них список преподавателя не показывает,
от кого сообщение (решение исполнителя T064–T065, отмечено в отчёте).
"""

from __future__ import annotations

from app.schemas.common import ApiModel


class ProblemReportView(ApiModel):
    id: str
    student_id: str
    student_name: str
    group_id: str | None = None
    attempt_id: str | None = None
    incident_number: int | None = None
    text: str
    has_attachment: bool
    created_at: str
    read_at: str | None = None
