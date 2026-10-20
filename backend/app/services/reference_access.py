"""Доступ обучающегося к справочнику во время попытки (спека 005, FR-008; research R4).

Преподаватель задаёт в задании `params.referenceAllowed`; у старых заданий без ключа действует значение по
умолчанию формата: тренировка — доступен, экзамен — нет. Замок действует, пока у обучающегося открыта
попытка (`ringing`/`answered`) по активному заданию с запретом. Экзамен с лимитом времени сначала проходит
`_expire`: вышедшее время закрывает попытку (`notCompleted`) и снимает замок. Преподаватель и администратор
не блокируются.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden
from app.models.assignment import Assignment, AssignmentAttempt
from app.services.assignment_service import _expire

LOCKED_MESSAGE = "Справочник недоступен в этом задании"
OPEN_STATES = ("ringing", "answered")


@dataclass(frozen=True)
class ReferenceAccess:
    allowed: bool
    assignment_id: str | None = None
    message: str | None = None

    def to_contract(self) -> dict[str, object]:
        data: dict[str, object] = {"allowed": self.allowed}
        if self.assignment_id:
            data["assignmentId"] = self.assignment_id
        if self.message:
            data["message"] = self.message
        return data


def effective_reference_allowed(row: Assignment) -> bool:
    value = (row.params or {}).get("referenceAllowed")
    return value if isinstance(value, bool) else row.format == "training"


async def access_for(db: AsyncSession, viewer: Viewer) -> ReferenceAccess:
    if viewer.role != "student":
        return ReferenceAccess(allowed=True)
    links = (await db.execute(
        select(AssignmentAttempt).where(AssignmentAttempt.student_id == viewer.user_id,
                                        AssignmentAttempt.state.in_(OPEN_STATES))
    )).scalars().all()
    for assignment_id in sorted({link.assignment_id for link in links}):
        row = await db.get(Assignment, assignment_id)
        if row is None or row.state != "active" or effective_reference_allowed(row):
            continue
        await _expire(db, row)
        still_open = (await db.execute(
            select(AssignmentAttempt.id).where(AssignmentAttempt.assignment_id == row.id,
                                               AssignmentAttempt.student_id == viewer.user_id,
                                               AssignmentAttempt.state.in_(OPEN_STATES))
        )).first()
        if still_open is not None:
            return ReferenceAccess(allowed=False, assignment_id=row.id, message=LOCKED_MESSAGE)
    return ReferenceAccess(allowed=True)


async def require_unlocked(db: AsyncSession, viewer: Viewer) -> None:
    """403 с понятным текстом, если справочник закрыт заданием; проверка на сервере, а не только в UI."""
    if not (await access_for(db, viewer)).allowed:
        raise forbidden(LOCKED_MESSAGE)
