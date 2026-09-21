"""POST /auth/login, GET /auth/policy — по src/shared/api/mock/auth.ts."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import account_blocked, bad_request, unauthorized, validation_failed
from app.db.session import get_db
from app.models.user import User
from app.services import audit
from app.services.reference import read_security_policy
from app.services.security import build_auth_session, verify_password

router = APIRouter()

LOGIN_ERROR_MESSAGE = "Неверный логин или пароль"
ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору"
TWO_FACTOR_CODE = re.compile(r"^\d{6}$")


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
    two_factor = body.get("twoFactorCode")
    if two_factor is not None and (not isinstance(two_factor, str) or not TWO_FACTOR_CODE.match(two_factor)):
        raise validation_failed("Код из сообщения должен состоять из 6 цифр")

    user = (await db.execute(select(User).where(User.login == login_value.strip()))).scalar_one_or_none()
    if user is None or user.arm_number != arm_number or not verify_password(password, user.password_hash):
        raise unauthorized(LOGIN_ERROR_MESSAGE)
    if not user.is_active:
        raise account_blocked(ACCOUNT_BLOCKED_MESSAGE)

    policy = await read_security_policy(db)
    two_factor_used = two_factor is not None
    if two_factor_used or not policy.get("require2fa", True):
        await audit.record(
            db,
            action="auth.login",
            user_id=user.id,
            role=user.role,
            details=f"Вход в систему, АРМ {user.arm_number}{', подтверждён кодом' if two_factor_used else ''}",
            operator_arm=user.arm_number,
        )
        await db.commit()
    return build_auth_session(user.id, user.role, two_factor_used)


@router.get("/auth/policy")
async def auth_policy(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    security = await read_security_policy(db)
    return {
        "twoFactorRequired": bool(security.get("require2fa", True)),
        "minPasswordLength": int(security.get("minPasswordLength", 8)),
        "lockAfterAttempts": int(security.get("lockAfterAttempts", 5)),
    }
