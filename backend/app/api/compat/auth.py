"""POST /auth/login, GET /auth/policy — по src/shared/api/mock/auth.ts."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.api.errors import account_blocked, bad_request, unauthorized, validation_failed
from app.db.session import get_db
from app.models.user import User
from app.services import audit, auth_throttle
from app.services.reference import read_security_policy
from app.services.security import build_auth_session, hash_password, revoke_session, verify_password

router = APIRouter()

LOGIN_ERROR_MESSAGE = "Неверный логин или пароль"
ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору"


@lru_cache(maxsize=1)
def _dummy_password_hash() -> str:
    return hash_password("Недействительный учебный пароль")


async def read_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception as exc:
        raise bad_request("Некорректное тело запроса: ожидается JSON") from exc
    if not isinstance(body, dict):
        raise bad_request("Некорректное тело запроса: ожидается JSON-объект")
    return body


def _read_arm_number(value: Any) -> int:
    if isinstance(value, bool):
        raise validation_failed("Укажите номер АРМ")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise validation_failed("Укажите номер АРМ")


@router.post("/auth/login")
async def login(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    body = await read_body(request)
    login_value = body.get("login")
    password = body.get("password")
    if not isinstance(login_value, str) or not login_value.strip():
        raise validation_failed("Укажите логин")
    if not isinstance(password, str) or not password:
        raise validation_failed("Укажите пароль")
    arm_number = _read_arm_number(body.get("armNumber"))
    if "twoFactorCode" in body:
        raise validation_failed("Проверка 2FA не используется; отправьте только логин и пароль")

    user = (await db.execute(select(User).where(User.login == login_value.strip()))).scalar_one_or_none()
    peer = request.client.host if request.client is not None else "unknown"
    await auth_throttle.check(db, peer, user)
    password_ok = verify_password(password, user.password_hash if user is not None else _dummy_password_hash())
    if user is None or user.arm_number != arm_number or not password_ok:
        policy = await read_security_policy(db)
        await auth_throttle.record_failure(db, peer, user, int(policy.get("lockAfterAttempts", 5)))
        raise unauthorized(LOGIN_ERROR_MESSAGE)
    if not user.is_active:
        raise account_blocked(ACCOUNT_BLOCKED_MESSAGE)

    await auth_throttle.clear_account(db, user)
    await audit.record(
        db,
        action="auth.login",
        user_id=user.id,
        role=user.role,
        details=f"Вход в систему, АРМ {user.arm_number}",
        operator_arm=user.arm_number,
    )
    session = await build_auth_session(db, user)
    await db.commit()
    return session


@router.get("/auth/policy")
async def auth_policy(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    security = await read_security_policy(db)
    return {
        "twoFactorRequired": False,
        "minPasswordLength": int(security.get("minPasswordLength", 8)),
        "lockAfterAttempts": int(security.get("lockAfterAttempts", 5)),
    }


@router.get("/auth/session")
async def current_session(db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    user = await db.get(User, viewer.user_id)
    assert user is not None
    return user.to_public()


@router.post("/auth/logout", status_code=204)
async def logout(db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> None:
    await revoke_session(db, viewer.session_hash)
    await db.commit()
