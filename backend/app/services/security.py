"""Пароли (argon2) и подписанный токен сессии (JWT HS256) в форме AuthSession фронта."""

from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.time import now_iso

_hasher = PasswordHasher()
ALGORITHM = "HS256"
TOKEN_ISSUER = "responders-academy"
TOKEN_AUDIENCE = "responders-academy-backend"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def jti_hash(jti: str) -> str:
    return sha256(jti.encode("utf-8")).hexdigest()


def issue_token(user_id: str, role: str, jti: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "role": role,
        "jti": jti,
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret.get_secret_value(),
            algorithms=[ALGORITHM],
            audience=TOKEN_AUDIENCE,
            issuer=TOKEN_ISSUER,
        )
    except JWTError:
        return None
    if not isinstance(payload.get("jti"), str) or len(payload["jti"]) < 32:
        return None
    return payload


async def build_auth_session(db: AsyncSession, user: User) -> dict[str, Any]:
    jti = secrets.token_urlsafe(32)
    issued_at = int(datetime.now(UTC).timestamp())
    expires_at = issued_at + get_settings().jwt_ttl_hours * 3600
    db.add(
        AuthSession(
            jti_hash=jti_hash(jti),
            user_id=user.id,
            issued_at=issued_at,
            expires_at=expires_at,
        )
    )
    await db.flush()
    return {
        "userId": user.id,
        "role": user.role,
        "token": issue_token(user.id, user.role, jti),
        "twoFactorUsed": False,
        "issuedAt": now_iso(),
    }


async def revoke_user_sessions(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=int(datetime.now(UTC).timestamp()))
    )


async def revoke_other_user_sessions(db: AsyncSession, user_id: str, keep_session_hash: str) -> None:
    """Отзыв всех сессий пользователя, кроме текущей (смена пароля)."""
    await db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.jti_hash != keep_session_hash,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=int(datetime.now(UTC).timestamp()))
    )


async def revoke_session(db: AsyncSession, session_hash: str) -> None:
    await db.execute(
        update(AuthSession)
        .where(AuthSession.jti_hash == session_hash, AuthSession.revoked_at.is_(None))
        .values(revoked_at=int(datetime.now(UTC).timestamp()))
    )


def temporary_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
