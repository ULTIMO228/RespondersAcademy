"""Пароли (argon2) и подписанный токен сессии (JWT HS256) в форме AuthSession фронта."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import get_settings
from app.services.time import now_iso

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def issue_token(user_id: str, role: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "role": role, "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=settings.jwt_ttl_hours)).timestamp())}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None


def build_auth_session(user_id: str, role: str, two_factor_used: bool) -> dict[str, Any]:
    return {
        "userId": user_id,
        "role": role,
        "token": issue_token(user_id, role),
        "twoFactorUsed": two_factor_used,
        "issuedAt": now_iso(),
    }


def temporary_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
