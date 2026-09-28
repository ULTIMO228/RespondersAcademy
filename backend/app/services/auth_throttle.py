"""Постоянные ограничения входа: учётная запись и сетевой источник."""

from __future__ import annotations

import hmac
from datetime import UTC, datetime
from hashlib import sha256

from sqlalchemy import case, delete, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import rate_limited
from app.config import get_settings
from app.models.auth_throttle import AuthThrottle
from app.models.user import User

ACCOUNT_LOCK_SECONDS = 15 * 60
SOURCE_WINDOW_SECONDS = 60
SOURCE_LOCK_SECONDS = 60
SOURCE_FAILURE_LIMIT = 60
THROTTLE_MESSAGE = "Слишком много попыток входа. Повторите позже"


def now_seconds() -> int:
    return int(datetime.now(UTC).timestamp())


def source_key(peer: str) -> str:
    secret = get_settings().jwt_secret.get_secret_value().encode("utf-8")
    return hmac.new(secret, f"source:{peer}".encode(), sha256).hexdigest()


async def check(db: AsyncSession, peer: str, user: User | None) -> None:
    now = now_seconds()
    source = await db.get(AuthThrottle, source_key(peer))
    if source is not None and source.blocked_until is not None and source.blocked_until > now:
        raise rate_limited(THROTTLE_MESSAGE)
    if user is not None and user.locked_until is not None and user.locked_until > now:
        raise rate_limited(THROTTLE_MESSAGE)


async def record_failure(db: AsyncSession, peer: str, user: User | None, account_limit: int) -> None:
    now = now_seconds()
    key = source_key(peer)
    insert = pg_insert if db.bind is not None and db.bind.dialect.name == "postgresql" else sqlite_insert
    statement = insert(AuthThrottle).values(key_hash=key, window_start=now, failures=1, blocked_until=None)
    reset = AuthThrottle.window_start <= now - SOURCE_WINDOW_SECONDS
    failures = case((reset, 1), else_=AuthThrottle.failures + 1)
    statement = statement.on_conflict_do_update(
        index_elements=[AuthThrottle.key_hash],
        set_={
            "window_start": case((reset, now), else_=AuthThrottle.window_start),
            "failures": failures,
            "blocked_until": case(
                (failures >= SOURCE_FAILURE_LIMIT, now + SOURCE_LOCK_SECONDS),
                else_=None,
            ),
        },
    )
    await db.execute(statement)
    if user is not None:
        next_failures = User.failed_logins + 1
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                failed_logins=next_failures,
                locked_until=case((next_failures >= account_limit, now + ACCOUNT_LOCK_SECONDS), else_=None),
            )
        )
    await db.commit()


async def clear_account(db: AsyncSession, user: User) -> None:
    user.failed_logins = 0
    user.locked_until = None


async def clear_expired(db: AsyncSession) -> None:
    """Периодическая очистка не даёт таблице сетевых источников расти бесконечно."""
    await db.execute(delete(AuthThrottle).where(AuthThrottle.window_start < now_seconds() - 86400))
    await db.commit()
