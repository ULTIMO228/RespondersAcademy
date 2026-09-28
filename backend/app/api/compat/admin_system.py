"""Раздел «Система» и журнал аудита администратора (T070) — порт `mock/system.ts`, `mock/system-audit.ts`.

Сервисы: переходы состояния в БД (процессами не управляем — как мок, честно), критичный сервис при идущем
занятии → 409. Настройки: секции с нормативами ТЗ (422 со списком полей), `database` read-only; `backup.lastAt`
в патче — «Выполнить сейчас»: реальный архив (`services/backup`: pg_dump / копия SQLite в `var/backups/`),
`lastAt` сохраняется как передан (совместимость с моком). Доступ: viewer не администратор → 403, аноним — как мок.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.api.errors import conflict, forbidden, not_found, unprocessable, validation_failed
from app.config import get_settings
from app.db.ids import PREFIX, next_id
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.reference import SystemSettings
from app.models.session import TrainingSession
from app.models.system import SystemLog, SystemService, SystemStatic
from app.models.user import User
from app.schemas.admin import (
    ADMIN_ONLY_MESSAGE,
    AUDIT_EVENT_TYPES,
    LOG_LEVELS,
    USAGE_PERIODS,
    SystemServiceActionRequest,
    describe_audit_action,
    read_settings_patch,
    resolve_audit_type,
    validate_settings_patch,
)
from app.schemas.common import page_response, read_page, read_string
from app.schemas.scenarios import parse_body
from app.services import audit
from app.services.backup import BackupError, run_backup
from app.services.time import is_iso, now_iso, parse_iso_ms
from ml.classify import ekp_group_classifier as classifier
from ml.nlp import embedder

router = APIRouter()

SESSION_LOCK_MESSAGE = "Недоступно во время активного занятия: остановка критичного сервиса прервёт учебный процесс"
ACTION_TITLES = {"start": "Запуск", "stop": "Остановка", "restart": "Перезапуск"}
VAR_SUBDIRS = ("backups", "recordings")


def _assert_admin(viewer: Viewer | None) -> None:
    if viewer is None or viewer.role != "admin":
        raise forbidden(ADMIN_ONLY_MESSAGE)


def _actor_id(viewer: Viewer | None, admin_id: str | None) -> str:
    return viewer.user_id if viewer is not None else (admin_id or "")


async def _services(db: AsyncSession) -> list[SystemService]:
    return list((await db.execute(select(SystemService).order_by(SystemService.seq, SystemService.id))).scalars().all())


async def _append_log(db: AsyncSession, level: str, source: str, message: str) -> SystemLog:
    entry = SystemLog(id=await next_id(db, PREFIX["systemLog"], SystemLog.id), at=now_iso(), level=level, source=source, message=message)
    db.add(entry)
    await db.flush()
    return entry


async def _has_running_session(db: AsyncSession) -> bool:
    return (await db.execute(select(TrainingSession.id).where(TrainingSession.state == "running").limit(1))).first() is not None


# ─── Самопроверка ─────────────────────────────────────────────────────────────────────────────────


async def integrity(db: AsyncSession) -> dict[str, Any]:
    """БД доступна, каталоги `var/` на месте, модели в `MODELS_DIR` (их отсутствие — предупреждение, не сбой FR-043)."""
    settings = get_settings()
    problems: list[str] = []
    notes: list[str] = []
    try:
        await db.execute(text("SELECT 1"))
        notes.append("БД доступна")
    except Exception as exc:  # noqa: BLE001 — любая ошибка драйвера = недоступность
        problems.append(f"БД недоступна: {exc.__class__.__name__}")
    for name in VAR_SUBDIRS:
        path = settings.var_dir / name
        try:
            path.mkdir(parents=True, exist_ok=True)
        except OSError:
            problems.append(f"каталог {path.name}/ недоступен")
    if not problems:
        notes.append("каталоги var/ доступны")
    notes.append("эмбеддер rubert-tiny2 загружен" if embedder.available() else "эмбеддер недоступен — лексический режим (FR-043)")
    notes.append(f"классификатор ЕКП: режим {classifier.mode()}")
    return {"ok": not problems, "checkedAt": now_iso(), "details": "; ".join([*problems, *notes])}


async def _services_response(db: AsyncSession) -> dict[str, Any]:
    return {"services": [s.to_contract() for s in await _services(db)], "integrity": await integrity(db)}


# ─── Сервисы ──────────────────────────────────────────────────────────────────────────────────────


@router.get("/admin/services")
async def get_services(db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    _assert_admin(viewer)
    return [s.to_contract() for s in await _services(db)]


@router.get("/admin/system/services")
async def get_system_services(db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    return await _services_response(db)


@router.post("/admin/system/services/{service_id}/action")
async def post_service_action(service_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    body: SystemServiceActionRequest = parse_body(SystemServiceActionRequest, await read_body(request))
    service = await db.get(SystemService, service_id)
    if service is None:
        raise not_found(f"Сервис «{service_id}» не найден")
    if service.critical and body.action != "start" and await _has_running_session(db):
        raise conflict(SESSION_LOCK_MESSAGE)
    if body.action == "stop":
        service.state, service.uptime_sec, service.started_at = "stopped", 0, None
    elif body.action == "restart" or service.state != "running":
        # start идемпотентен: запущенный сервис аптайм не теряет; restart обнуляет его всегда.
        service.state, service.uptime_sec, service.started_at = "running", 0, now_iso()
    await db.flush()
    details = f"{ACTION_TITLES[body.action]} сервиса «{service.name}»: состояние {service.state}"
    await _append_log(db, "WARN" if body.action == "stop" else "INFO", service.id, details)
    await audit.record(db, action="service.action", user_id=_actor_id(viewer, body.admin_id) or None, role="admin", details=details)
    await db.commit()
    return await _services_response(db)


# ─── Настройки ────────────────────────────────────────────────────────────────────────────────────


async def _settings_row(db: AsyncSession) -> SystemSettings:
    row = await db.get(SystemSettings, 1)
    if row is None:
        raise not_found("Настройки системы не загружены — выполните загрузку сидов")
    return row


@router.get("/admin/settings")
@router.get("/admin/system/settings")
async def get_system_settings(db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    settings = dict((await _settings_row(db)).settings)
    settings["security"] = {key: value for key, value in settings.get("security", {}).items() if key != "require2fa"}
    return settings


def _describe_patch(patch: dict[str, dict[str, Any]]) -> str:
    return "; ".join(f"{key}: {', '.join(value.keys())}" for key, value in patch.items() if value)


@router.patch("/admin/system/settings")
async def patch_system_settings(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    body = await read_body(request)
    patch = read_settings_patch(body)
    errors = validate_settings_patch(patch)
    if errors:
        raise unprocessable("Настройки не сохранены. " + "; ".join(e["message"] for e in errors))
    row = await _settings_row(db)
    merged = {key: dict(value) if isinstance(value, dict) else value for key, value in row.settings.items()}
    for section, values in patch.items():
        target = merged.setdefault(section, {})
        target.update({k: v for k, v in values.items() if v is not None})
    row.settings = merged
    await db.flush()
    user_id = _actor_id(viewer, body.get("adminId") if isinstance(body.get("adminId"), str) else None) or None
    backup_requested = "lastAt" in patch.get("backup", {})
    if backup_requested:
        try:
            archive = await asyncio.to_thread(run_backup)
            await _append_log(db, "INFO", "svc-backup", f"Бэкап выполнен вручную: {archive.name} в {archive.parent.name}/")
            outcome = f"архив {archive.name}"
        except BackupError as exc:
            await _append_log(db, "ERROR", "svc-backup", f"Бэкап не выполнен: {exc}")
            outcome = f"архив не создан ({exc})"
        await audit.record(db, action="backup.run", user_id=user_id, role="admin", details=f"Резервное копирование выполнено, метка последнего бэкапа: {merged['backup'].get('lastAt')}; {outcome}")
    changed = _describe_patch(patch)
    if changed and not backup_requested:
        await _append_log(db, "INFO", "svc-web", f"Изменены настройки — {changed}")
        await audit.record(db, action="settings.update", user_id=user_id, role="admin", details=f"Изменены настройки системы — {changed}")
    await db.commit()
    merged["security"] = {key: value for key, value in merged.get("security", {}).items() if key != "require2fa"}
    return dict(merged)


# ─── Журналы, мониторинг, статистика ──────────────────────────────────────────────────────────────


@router.get("/admin/system/logs")
async def get_system_logs(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    _assert_admin(viewer)
    level = read_string(request.query_params, "level")
    if level is not None and level not in LOG_LEVELS:
        raise validation_failed(f"Некорректный уровень логов: «{level}». Допустимо: INFO, WARN, ERROR")
    query = select(SystemLog)
    if level:
        query = query.where(SystemLog.level == level)
    rows = (await db.execute(query.order_by(SystemLog.at.desc(), SystemLog.id.desc()))).scalars().all()
    return [row.to_contract() for row in rows]


async def _static(db: AsyncSession, key: str) -> Any:
    row = await db.get(SystemStatic, key)
    if row is None:
        raise not_found(f"Данные «{key}» не загружены — выполните загрузку сидов")
    return row.value


@router.get("/admin/system/monitoring")
async def get_monitoring(db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    return dict(await _static(db, "monitoring"))


@router.get("/admin/system/usage-stats")
async def get_usage_stats(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    _assert_admin(viewer)
    period = read_string(request.query_params, "period")
    stats = dict(await _static(db, "usageStats"))
    if period is None:
        return stats
    if period not in USAGE_PERIODS:
        raise validation_failed(f"Некорректный период статистики: «{period}». Допустимо: week, month")
    return {"periods": [item for item in stats.get("periods", []) if item.get("id") == period]}


# ─── Аудит ────────────────────────────────────────────────────────────────────────────────────────


def _parse_date(params, key: str) -> int | None:
    raw = read_string(params, key)
    if raw is None:
        return None
    candidate = raw if "T" in raw or len(raw) > 10 else f"{raw}T00:00:00+03:00"
    if key == "to" and len(raw) <= 10:
        candidate = f"{raw}T23:59:59+03:00"
    if not is_iso(candidate):
        raise validation_failed(f"Некорректная дата в параметре «{key}»: {raw}")
    return parse_iso_ms(candidate)


@router.get("/admin/audit")
async def get_audit(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    # Журнал читает и преподаватель (scripts/e2e-teacher.sh сверяет решения конструктора и правки оценок); студент → 403.
    if viewer is not None and viewer.role not in ("admin", "teacher"):
        raise forbidden(ADMIN_ONLY_MESSAGE)
    params = request.query_params
    event_type = read_string(params, "type")
    if event_type is not None and event_type not in AUDIT_EVENT_TYPES:
        raise validation_failed(f"Некорректный тип события: «{event_type}»")
    operator = (read_string(params, "operator") or "").lower() or None
    card = (read_string(params, "card") or "").lower() or None
    needle = (read_string(params, "q") or "").lower() or None
    since, until = _parse_date(params, "from"), _parse_date(params, "to")
    page, per_page = read_page(params)
    users = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    rows = (await db.execute(select(AuditLog).order_by(AuditLog.at.desc(), AuditLog.id.desc()))).scalars().all()
    filtered: list[dict[str, Any]] = []
    for row in rows:
        if event_type and resolve_audit_type(row.action) != event_type:
            continue
        if operator:
            user = users.get(row.user_id or "")
            fields = [user.full_name if user else None, user.login if user else None, user.arm_number if user else None, row.operator_arm, row.user_id]
            if not any(field is not None and operator in str(field).lower() for field in fields):
                continue
        if card and card not in (row.card_id or "").lower():
            continue
        at = parse_iso_ms(row.at)
        if (since is not None and at < since) or (until is not None and at > until):
            continue
        if needle and not any(needle in str(f).lower() for f in (describe_audit_action(row.action), row.action, row.details, row.card_id) if f):
            continue
        filtered.append(row.to_contract())
    first = (page - 1) * per_page
    return page_response(filtered[first : first + per_page], len(filtered), page, per_page)
