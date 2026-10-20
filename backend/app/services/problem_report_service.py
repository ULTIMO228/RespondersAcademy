"""«Сообщить о проблеме» (спека 009, US6): отправка учеником и просмотр преподавателем своих групп.

Видимость — как у рейтинга 017 (`error_map_access`): преподаватель видит сообщения обучающихся закреплённых групп,
администратор — все. Чужое сообщение и чужое вложение — 404 (существование не раскрывается). Текст в аудит не пишется.
Вложение: png или jpeg не больше 2 МБ, проверяются и заявленный MIME, и сигнатура первых байт.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import ColumnElement, false, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import not_found, validation_failed
from app.config import get_settings
from app.db.ids import PREFIX, next_id
from app.models.problem_report import ProblemReport
from app.models.session import Attempt
from app.models.user import User
from app.schemas.v1.problem_reports import ProblemReportView
from app.services import audit, error_map_access
from app.services.time import now_iso

TEXT_MAX_LENGTH = 2000
ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024
UPLOAD_SUBDIR = Path("uploads") / "problem-reports"  # относительно var/ (settings.var_dir)

# MIME → (расширение файла, сигнатура первых байт).
IMAGE_TYPES: dict[str, tuple[str, bytes]] = {
    "image/png": ("png", b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": ("jpg", b"\xff\xd8\xff"),
}
EXTENSION_MEDIA: dict[str, str] = {"png": "image/png", "jpg": "image/jpeg"}


def _clean_text(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        raise validation_failed("Опишите проблему: текст сообщения не может быть пустым")
    if len(text) > TEXT_MAX_LENGTH:
        raise validation_failed(f"Текст сообщения — не больше {TEXT_MAX_LENGTH} символов")
    return text


def _clean_attempt_id(raw: str | None) -> str | None:
    value = (raw or "").strip()
    return value or None


def _clean_incident_number(raw: str | None) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not value.isdigit() or int(value) < 1:
        raise validation_failed("Номер происшествия — целое число не меньше 1")
    return int(value)


async def _read_attachment(upload: UploadFile | None) -> tuple[str, bytes] | None:
    """Вложение необязательно: пустая часть формы без имени файла — это «без вложения»."""
    if upload is None:
        return None
    data = await upload.read(ATTACHMENT_MAX_BYTES + 1)
    if not data and not upload.filename:
        return None
    if len(data) > ATTACHMENT_MAX_BYTES:
        raise validation_failed("Вложение — не больше 2 МБ")
    kind = IMAGE_TYPES.get(upload.content_type or "")
    if kind is None or not data.startswith(kind[1]):
        raise validation_failed("Вложение — изображение в формате png или jpeg")
    return kind[0], data


def uploads_dir() -> Path:
    return get_settings().var_dir / UPLOAD_SUBDIR


def _view(report: ProblemReport, student_name: str, group_id: str | None) -> dict[str, Any]:
    return ProblemReportView(
        id=report.id,
        student_id=report.student_id,
        student_name=student_name,
        group_id=group_id,
        attempt_id=report.attempt_id,
        incident_number=report.incident_number,
        text=report.text,
        has_attachment=bool(report.attachment_path),
        created_at=report.created_at,
        read_at=report.read_at,
    ).dump()


async def create_report(
    db: AsyncSession,
    viewer: Viewer,
    *,
    text: str | None,
    attempt_id: str | None,
    incident_number: str | None,
    attachment: UploadFile | None,
) -> dict[str, Any]:
    """Сохраняет сообщение ученика; все проверки входа — до записи в БД и на диск."""
    body = _clean_text(text)
    attempt = _clean_attempt_id(attempt_id)
    incident = _clean_incident_number(incident_number)
    file = await _read_attachment(attachment)
    if attempt is not None:
        own_attempt = await db.get(Attempt, attempt)
        if own_attempt is None or own_attempt.student_id != viewer.user_id:
            raise not_found(f"Попытка «{attempt}» не найдена")
    student = await db.get(User, viewer.user_id)
    report = ProblemReport(
        id=await next_id(db, PREFIX["problemReport"], ProblemReport.id),
        student_id=viewer.user_id,
        attempt_id=attempt,
        incident_number=incident,
        text=body,
        created_at=now_iso(),
    )
    db.add(report)
    await db.flush()
    if file is not None:
        extension, data = file
        relative = UPLOAD_SUBDIR / f"{report.id}.{extension}"
        target = get_settings().var_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        report.attachment_path = relative.as_posix()
    details = (
        f"Сообщение о проблеме {report.id}: попытка {attempt or 'не указана'}, "
        f"происшествие {incident or 'не указано'}, вложение {'есть' if file else 'нет'}"
    )
    await audit.record(db, action="problem_report.created", user_id=viewer.user_id, role=viewer.role, details=details)
    await db.commit()
    return _view(report, student.full_name if student else viewer.user_id, student.group if student else None)


async def _visibility(db: AsyncSession, viewer: Viewer) -> ColumnElement[bool]:
    """Администратор — все сообщения; преподаватель — сообщения обучающихся его закреплённых групп."""
    if viewer.role == "admin":
        return true()
    groups = [group.group_id for group in await error_map_access.accessible_groups(db, viewer)]
    return User.group.in_(groups) if groups else false()


def _joined():
    return select(ProblemReport, User.full_name, User.group).join(User, User.id == ProblemReport.student_id)


async def list_for_teacher(db: AsyncSession, viewer: Viewer) -> list[dict[str, Any]]:
    visible = await _visibility(db, viewer)
    rows = (await db.execute(
        _joined().where(visible).order_by(ProblemReport.created_at.desc(), ProblemReport.id.desc())
    )).all()
    return [_view(report, name, group) for report, name, group in rows]


async def _visible_report(db: AsyncSession, viewer: Viewer, report_id: str) -> tuple[ProblemReport, str, str | None]:
    visible = await _visibility(db, viewer)
    row = (await db.execute(_joined().where(ProblemReport.id == report_id, visible))).one_or_none()
    if row is None:
        raise not_found(f"Сообщение «{report_id}» не найдено")
    report, name, group = row
    return report, name, group


async def mark_read(db: AsyncSession, viewer: Viewer, report_id: str) -> dict[str, Any]:
    """Отметка прочтения: первый раз ставит время, повторный вызов не меняет его."""
    report, name, group = await _visible_report(db, viewer, report_id)
    if report.read_at is None:
        report.read_at = now_iso()
        await db.commit()
    return _view(report, name, group)


async def attachment_file(db: AsyncSession, viewer: Viewer, report_id: str) -> tuple[Path, str]:
    report, _name, _group = await _visible_report(db, viewer, report_id)
    if not report.attachment_path:
        raise not_found(f"У сообщения «{report_id}» нет вложения")
    path = get_settings().var_dir / report.attachment_path
    if not path.is_file():
        raise not_found(f"Файл вложения «{report_id}» не найден")
    return path, EXTENSION_MEDIA[path.suffix.lstrip(".")]
