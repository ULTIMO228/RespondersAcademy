"""POST /auth/login, GET /auth/policy, GET /auth/session, POST /auth/logout — по src/shared/api/mock/auth.ts."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SESSION_COOKIE, Viewer, get_viewer, require_viewer
from app.api.errors import account_blocked, bad_request, unauthorized, validation_failed
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.services import audit, auth_throttle
from app.services.reference import read_security_policy
from app.services.security import (
    build_auth_session,
    hash_password,
    revoke_other_user_sessions,
    revoke_session,
    revoke_user_sessions,
    verify_password,
)

router = APIRouter()

LOGIN_ERROR_MESSAGE = "Неверный логин или пароль"
ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору"
WRONG_CURRENT_PASSWORD_MESSAGE = "Текущий пароль указан неверно"


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


def _read_arm_number(value: Any) -> int | None:
    """Номер АРМ необязателен (платформа входит по логину и паролю); если передан — должен быть числом и сверяется."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise validation_failed("Номер АРМ должен быть числом")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise validation_failed("Номер АРМ должен быть числом")


def _is_https(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded == "https"


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    """Cookie сессии выдаёт сервер: значение — только JWT, недоступна скриптам страницы, `Secure` при HTTPS."""
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=get_settings().jwt_ttl_hours * 3600,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
    )


def clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=_is_https(request))


@router.post("/auth/login")
async def login(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
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
    if user is None or (arm_number is not None and user.arm_number != arm_number) or not password_ok:
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
    set_session_cookie(response, request, session["token"])
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
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer | None = Depends(get_viewer),
) -> None:
    """Идемпотентный выход: сессия (если жива) отзывается, cookie очищается в любом случае."""
    clear_session_cookie(response, request)
    if viewer is None:
        return
    user = await db.get(User, viewer.user_id)
    await audit.record(
        db,
        action="auth.logout",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Выход из системы, АРМ {user.arm_number}" if user is not None else "Выход из системы",
        operator_arm=user.arm_number if user is not None else None,
    )
    await revoke_session(db, viewer.session_hash)
    await db.commit()


@router.post("/auth/password", status_code=204)
async def change_password(
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> None:
    """Смена пароля самим пользователем: текущий пароль, политика длины, отзыв остальных сессий (текущая жива).

    Неверный текущий пароль — 400, а не 401: 401 фронт трактует как «сессия истекла» и уводит на вход.
    Такие попытки считаются как неудачные входы (блокировка по `lockAfterAttempts`).
    """
    body = await read_body(request)
    current, new = body.get("currentPassword"), body.get("newPassword")
    if not isinstance(current, str) or not current:
        raise validation_failed("Укажите текущий пароль")
    if not isinstance(new, str) or not new:
        raise validation_failed("Укажите новый пароль")
    user = await db.get(User, viewer.user_id)
    assert user is not None
    peer = request.client.host if request.client is not None else "unknown"
    await auth_throttle.check(db, peer, user)
    policy = await read_security_policy(db)
    if not verify_password(current, user.password_hash):
        await auth_throttle.record_failure(db, peer, user, int(policy.get("lockAfterAttempts", 5)))
        raise validation_failed(WRONG_CURRENT_PASSWORD_MESSAGE)
    min_length = int(policy.get("minPasswordLength", 8))
    if len(new) < min_length:
        raise validation_failed(f"Пароль должен содержать не менее {min_length} символов")
    if verify_password(new, user.password_hash):
        raise validation_failed("Новый пароль должен отличаться от текущего")
    user.password_hash = hash_password(new)
    await auth_throttle.clear_account(db, user)
    await revoke_other_user_sessions(db, user.id, viewer.session_hash)
    await audit.record(
        db,
        action="auth.passwordChange",
        user_id=user.id,
        role=user.role,
        details=f"Смена пароля пользователем, АРМ {user.arm_number}; остальные сессии завершены",
        operator_arm=user.arm_number,
    )
    await db.commit()


@router.post("/auth/logout-all", status_code=204)
async def logout_all(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> None:
    """«Выйти на всех устройствах»: отзываются все сессии пользователя, включая текущую; cookie очищается."""
    user = await db.get(User, viewer.user_id)
    await revoke_user_sessions(db, viewer.user_id)
    await audit.record(
        db,
        action="auth.logoutAll",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Выход на всех устройствах, АРМ {user.arm_number}" if user is not None else "Выход на всех устройствах",
        operator_arm=user.arm_number if user is not None else None,
    )
    await db.commit()
    clear_session_cookie(response, request)
