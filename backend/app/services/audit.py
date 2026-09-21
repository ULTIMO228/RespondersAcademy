"""Журнал аудита: запись событий в форме AuditLogEntry (id audit-NNN, новые — первыми при чтении)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.ids import PREFIX, next_id
from app.models.audit import AuditLog
from app.services.time import now_iso


async def record(
    db: AsyncSession,
    *,
    action: str,
    user_id: str | None,
    role: str,
    details: str,
    ip: str | None = None,
    card_id: str | None = None,
    operator_arm: int | None = None,
) -> AuditLog:
    entry = AuditLog(
        id=await next_id(db, PREFIX["audit"], AuditLog.id),
        at=now_iso(),
        user_id=user_id,
        role=role,
        action=action,
        details=details,
        ip=ip,
        card_id=card_id,
        operator_arm=operator_arm,
    )
    db.add(entry)
    await db.flush()
    return entry
