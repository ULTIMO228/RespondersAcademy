"""Карта ошибок (спека 003): эндпоинты `/api/v1/error-map/*` и `/api/v1/me/focus`.

Каркас (T016): общий разбор query-параметров `mode` / `period` (зависимость `map_params`) и список групп.
Остальные эндпоинты добавляются по историям. Пути полные, как у соседних роутеров (`lobby.py`), поэтому
`router` без префикса: иначе `/me/focus` попадёт под `/error-map`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, cast, get_args
from urllib.parse import quote

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_role
from app.api.errors import not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.db.session import get_db
from app.models.error_map import ErrorMapVerdict
from app.models.user import User
from app.schemas.error_map import (
    ErrorMapGroup,
    ErrorMapJournalResponse,
    ErrorMapMode,
    ErrorMapPeriod,
    ErrorMapResponse,
    ErrorMapStageDetail,
    ErrorMapVerdictRequest,
    MyFocusResponse,
)
from app.schemas.error_map import ErrorMapSettings as ErrorMapSettingsSchema
from app.services import audit, error_map_access, error_map_pdf, error_map_service, error_map_settings
from app.services.error_map_stages import get_stage
from app.services.time import now_iso

router = APIRouter()
teacher_or_admin = require_role("teacher", "admin")
admin_only = require_role("admin")
student_only = require_role("student")

# Подписи порогов в записи аудита (порядок — как в разделе `errorMap`).
SETTING_TITLES = {
    "sometimesFrom": "порог «иногда»",
    "oftenFrom": "порог «часто»",
    "minAttemptsGroup": "минимум попыток группы",
    "minAttemptsStudent": "минимум попыток обучающегося",
    "sameBandPoints": "допуск «как у группы»",
}

DEFAULT_MODE: ErrorMapMode = "dds"
DEFAULT_PERIOD: ErrorMapPeriod = "1m"


@dataclass(frozen=True)
class MapParams:
    mode: ErrorMapMode
    period: ErrorMapPeriod


def _choose(name: str, raw: str | None, allowed: tuple[str, ...], default: str) -> str:
    """Пустое значение — умолчание; неизвестное — 400 validationFailed (не 422: см. app/api/errors.py)."""
    if raw is None or not raw.strip():
        return default
    value = raw.strip()
    if value not in allowed:
        raise validation_failed(f"Некорректное значение поля «{name}»: допустимо {', '.join(allowed)}")
    return value


def map_params(
    mode: Annotated[str | None, Query(description="Режим: dds или operator112; по умолчанию dds")] = None,
    period: Annotated[str | None, Query(description="Период: 2w, 1m или all; по умолчанию 1m")] = None,
) -> MapParams:
    return MapParams(
        mode=cast(ErrorMapMode, _choose("mode", mode, get_args(ErrorMapMode), DEFAULT_MODE)),
        period=cast(ErrorMapPeriod, _choose("period", period, get_args(ErrorMapPeriod), DEFAULT_PERIOD)),
    )


@router.get("/error-map/groups", response_model=list[ErrorMapGroup], response_model_by_alias=True)
async def list_groups(
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> list[ErrorMapGroup]:
    """Группы, доступные пользователю: [{groupId, title, studentCount}]; у преподавателя без закреплений — []."""
    groups = await error_map_access.accessible_groups(db, viewer)
    return [ErrorMapGroup(group_id=item.group_id, title=item.group_id, student_count=item.student_count) for item in groups]


@router.get("/error-map/groups/{groupId}", response_model=ErrorMapResponse, response_model_by_alias=True)
async def group_error_map(
    group_id: Annotated[str, Path(alias="groupId")],
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Карта ошибок группы: этапы, уровни светофора, вывод. 404 — группы нет, 403 — не закреплена за преподавателем."""
    return (await error_map_service.group_map(db, viewer, group_id, params.mode, params.period)).dump()


@router.get(
    "/error-map/groups/{groupId}/stages/{stageId}",
    response_model=ErrorMapStageDetail,
    response_model_by_alias=True,
)
async def group_stage_detail(
    group_id: Annotated[str, Path(alias="groupId")],
    stage_id: Annotated[str, Path(alias="stageId")],
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Разбор этапа группы: типовые ошибки, кто ошибается, пример попытки, цепочка. 404 — нет группы или этапа."""
    return (
        await error_map_service.stage_detail(db, viewer, group_id, stage_id, params.mode, params.period)
    ).dump()


@router.get(
    "/error-map/groups/{groupId}/journal",
    response_model=ErrorMapJournalResponse,
    response_model_by_alias=True,
)
async def group_journal(
    group_id: Annotated[str, Path(alias="groupId")],
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Журнал группы «обучающиеся × этапы»: уровень и сравнение в каждой ячейке. 404 — группы нет, 403 — чужая."""
    return (await error_map_service.journal(db, viewer, group_id, params.mode, params.period)).dump()


PDF_SCOPES = ("group", "student", "journal")


@router.get("/error-map/export.pdf", response_class=Response)
async def export_pdf(
    scope: Annotated[str | None, Query(description="group, student или journal")] = None,
    group_id: Annotated[str | None, Query(alias="groupId", description="Группа: для scope=group и journal")] = None,
    student_id: Annotated[str | None, Query(alias="studentId", description="Обучающийся: для scope=student")] = None,
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> Response:
    """PDF карты группы, карты обучающегося или журнала для печати (FR-022). 400 — нет scope или id, 403/404 — как у экранов."""
    chosen = cast(error_map_pdf.Scope, _choose("scope", scope, PDF_SCOPES, ""))
    if not chosen:
        raise validation_failed(f"Не указан параметр «scope»: допустимо {', '.join(PDF_SCOPES)}")
    group = (group_id or "").strip() or None
    student = (student_id or "").strip() or None
    if chosen == "student" and student is None:
        raise validation_failed("Для scope=student нужен параметр «studentId»")
    if chosen != "student" and group is None:
        raise validation_failed(f"Для scope={chosen} нужен параметр «groupId»")
    document = await error_map_pdf.build_document(
        db, viewer, scope=chosen, group_id=group, student_id=student, mode=params.mode, period=params.period
    )
    content = await run_in_threadpool(error_map_pdf.render_pdf, document)
    name = quote(error_map_pdf.pdf_filename(chosen, group, student), safe="")
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{name}", "Cache-Control": "no-store"},
    )


@router.get("/error-map/students/{studentId}", response_model=ErrorMapResponse, response_model_by_alias=True)
async def student_error_map(
    student_id: Annotated[str, Path(alias="studentId")],
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Карта ошибок обучающегося со сравнением «лучше / как у группы / хуже». 404 — нет обучающегося, 403 — чужая группа."""
    return (await error_map_service.student_map(db, viewer, student_id, params.mode, params.period)).dump()


@router.get(
    "/error-map/students/{studentId}/stages/{stageId}",
    response_model=ErrorMapStageDetail,
    response_model_by_alias=True,
)
async def student_stage_detail(
    student_id: Annotated[str, Path(alias="studentId")],
    stage_id: Annotated[str, Path(alias="stageId")],
    params: MapParams = Depends(map_params),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Разбор этапа для обучающегося: его типовые ошибки и пример его попытки. 404 — нет обучающегося или этапа."""
    return (
        await error_map_service.student_stage_detail(db, viewer, student_id, stage_id, params.mode, params.period)
    ).dump()


def _settings_view(settings: error_map_settings.ErrorMapSettings) -> dict[str, Any]:
    """Пороги в camelCase через схему ErrorMapSettings — ровно та форма, которую ждёт клиент."""
    return ErrorMapSettingsSchema.model_validate(error_map_settings.settings_payload(settings)).dump()


def _describe_thresholds(settings: error_map_settings.ErrorMapSettings) -> str:
    payload = error_map_settings.settings_payload(settings)
    return "; ".join(f"{SETTING_TITLES[key]} {value}" for key, value in payload.items())


@router.get("/error-map/settings", response_model=ErrorMapSettingsSchema, response_model_by_alias=True)
async def get_error_map_settings(
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(admin_only),
) -> dict[str, Any]:
    """Пороги светофора (администратор). Строка настроек, раздел или ключ отсутствуют — умолчания."""
    return _settings_view(await error_map_settings.read_error_map_settings(db))


@router.put("/error-map/settings", response_model=ErrorMapSettingsSchema, response_model_by_alias=True)
async def put_error_map_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(admin_only),
) -> dict[str, Any]:
    """Частичный патч порогов (клиент шлёт полный объект); ответ — сохранённые пороги.

    400 — неверное значение или неизвестный ключ, ничего не записано; 404 — нет строки настроек системы.
    Успешная запись фиксируется в аудите (`error_map.settings`) со старыми и новыми порогами.
    """
    before = await error_map_settings.read_error_map_settings(db)
    after = await error_map_settings.save_error_map_settings(db, await read_body(request))
    details = (
        f"Пороги карты ошибок. Было: {_describe_thresholds(before)}. Стало: {_describe_thresholds(after)}"
    )
    await audit.record(
        db, action="error_map.settings", user_id=viewer.user_id, role=viewer.role, details=details
    )
    await db.commit()
    return _settings_view(after)


VERDICT_LABELS = {"agree": "Согласен", "disagree": "Не согласен"}
SOURCE_LABELS = {"ai": "ИИ", "template": "шаблон"}


def _read_verdict(raw: dict[str, Any]) -> ErrorMapVerdictRequest:
    try:
        body = ErrorMapVerdictRequest.model_validate(raw)
    except ValidationError as exc:
        fields = ", ".join(sorted({str(err["loc"][-1]) for err in exc.errors() if err["loc"]})) or "тело запроса"
        raise validation_failed(f"Некорректный вердикт: проверьте поля ({fields})") from exc
    if not body.text_hash.strip() or not body.group_id.strip() or not body.stage_id.strip():
        raise validation_failed("Некорректный вердикт: пустой идентификатор или хэш текста")
    return body


@router.put("/error-map/verdicts")
async def put_error_map_verdict(
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Вердикт «Согласен / Не согласен» по пояснению ИИ (US6). Один вердикт на (преподаватель, группа,
    обучающийся, режим, этап, текст): повтор заменяет прежний. 400 — неверное тело или обучающийся не из группы,
    403 — группа не закреплена, 404 — нет группы или этапа. Решение преподавателя оценок и светофора не меняет."""
    body = _read_verdict(await read_body(request))
    await error_map_access.require_group_access(db, viewer, body.group_id)
    stage = get_stage(body.mode, body.stage_id)
    if stage is None:
        raise not_found(f"Этап «{body.stage_id}» не найден")
    student_id = (body.student_id or "").strip()
    if student_id:
        student = await db.get(User, student_id)
        if student is None or student.role != "student" or student.group != body.group_id:
            raise validation_failed("Обучающийся не относится к указанной группе")

    existing = (
        await db.execute(
            select(ErrorMapVerdict).where(
                ErrorMapVerdict.teacher_id == viewer.user_id,
                ErrorMapVerdict.group_id == body.group_id,
                ErrorMapVerdict.student_id == student_id,
                ErrorMapVerdict.mode == body.mode,
                ErrorMapVerdict.stage_id == body.stage_id,
                ErrorMapVerdict.text_hash == body.text_hash,
            )
        )
    ).scalar_one_or_none()
    previous = existing.verdict if existing is not None else None
    if existing is None:
        db.add(
            ErrorMapVerdict(
                id=await next_id(db, PREFIX["errorMapVerdict"], ErrorMapVerdict.id),
                teacher_id=viewer.user_id,
                group_id=body.group_id,
                student_id=student_id,
                mode=body.mode,
                stage_id=body.stage_id,
                period=body.period,
                source=body.source,
                text_hash=body.text_hash,
                verdict=body.verdict,
                created_at=now_iso(),
            )
        )
    else:
        existing.verdict = body.verdict
        existing.period = body.period
        existing.source = body.source

    who = f", обучающийся {student_id}" if student_id else ""
    details = (
        f"Вердикт по пояснению карты ошибок: группа {body.group_id}{who}, этап «{stage.title}» ({stage.id}), "
        f"источник текста: {SOURCE_LABELS[body.source]}, вердикт «{VERDICT_LABELS[body.verdict]}»"
    )
    if previous is not None and previous != body.verdict:
        details += f", прежний вердикт «{VERDICT_LABELS[previous]}»"
    await audit.record(db, action="error_map.verdict", user_id=viewer.user_id, role=viewer.role, details=details)
    await db.commit()
    return {"saved": True, "verdict": body.verdict}


@router.get("/me/focus", response_model=MyFocusResponse, response_model_by_alias=True)
async def my_focus(
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(student_only),
) -> dict[str, Any]:
    """«Над чем поработать»: до трёх этапов обучающегося; только его данные. 401 — нет сессии, 403 — не обучающийся."""
    return (await error_map_service.my_focus(db, viewer)).dump()
