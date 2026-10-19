"""Пояснение «Почему так происходит» и вердикты преподавателя (фича 003, US6, FR-016…FR-019).

Пояснение — подсказка в разборе этапа, а не оценка: оно не меняет светофор, баллы и вывод карты. Источник текста:

* `ai` — локальная модель через `AiGateway.explain_stage` (необязательный метод; по умолчанию шлюз возвращает `None`);
* `template` — шаблон по доминирующей ошибке этапа: детерминированный, без модели, без сети; на экране помечается
  «справочное пояснение». Шаблон включается, если шлюз вернул `None`, пустое, слишком длинное или бросил исключение.

Текст — одна-две фразы. Для этапа без данных (`noData`) пояснения нет вовсе, и модель не вызывается. Вердикт «Согласен /
Не согласен» привязан к хэшу показанного текста: новый текст — новый вердикт; решение остаётся за преподавателем.
"""

from __future__ import annotations

import hashlib
import logging
import re
from collections.abc import Sequence
from typing import Any, Final, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.ai_gateway import get_gateway
from app.api.deps import Viewer
from app.models.error_map import ErrorMapVerdict
from app.schemas.error_map import (
    ErrorMapExplanation,
    ErrorMapStage,
    ErrorMapStageLevel,
    ErrorMapTypicalError,
)
from app.services.external_ai_audit import flush_external_calls

logger = logging.getLogger(__name__)

Subject = Literal["group", "student"]

MAX_SENTENCES: Final = 2
RAW_MAX_CHARS: Final = 400  # ответ модели длиннее — не «1–2 фразы», а сбой формата: берём шаблон
TEXT_MAX_CHARS: Final = 300
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def plural_students(count: int) -> str:
    """«1 обучающийся», «2 обучающихся», «5 обучающихся», «21 обучающийся»."""
    if count % 10 == 1 and count % 100 != 11:
        return f"{count} обучающийся"
    return f"{count} обучающихся"


def text_hash(text: str) -> str:
    """Хэш показанного текста (64 hex-символа — размер колонки `text_hash`): вердикт относится к этому тексту."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _lower_first(text: str) -> str:
    """Начало фразы со строчной буквы, кроме аббревиатур («ДДС»): иначе «чаще всего: Нет …» читается плохо."""
    if len(text) > 1 and text[0].isupper() and text[1].islower():
        return text[0].lower() + text[1:]
    return text


def template_text(*, stage_title: str, typical_errors: Sequence[ErrorMapTypicalError], subject: Subject) -> str:
    """Справочное пояснение по доминирующей (первой в списке) ошибке этапа: одна-две фразы, без модели."""
    if not typical_errors:
        return f"На этапе «{stage_title}» заметных ошибок нет."
    top = typical_errors[0]
    first = f"На этапе «{stage_title}» чаще всего: {_lower_first(top.plain_text.rstrip('.'))}."
    if subject == "student":
        return f"{first} Стоит повторить тему и разобрать пример."
    count = top.student_count
    verb = "ошибается" if count % 10 == 1 and count % 100 != 11 else "ошибаются"
    return f"{first} Так {verb} {plural_students(count)}."


def clean_gateway_text(raw: object) -> str | None:
    """Ответ шлюза → текст для экрана: пробелы схлопнуты, не больше двух фраз; сбой формата → `None` (шаблон)."""
    if not isinstance(raw, str) or len(raw) > RAW_MAX_CHARS:
        return None
    text = " ".join(raw.split())
    if not text:
        return None
    text = " ".join(_SENTENCE_END.split(text)[:MAX_SENTENCES])
    return text if len(text) <= TEXT_MAX_CHARS else None


def _gateway_payload(
    stage: ErrorMapStage, level: ErrorMapStageLevel, typical_errors: Sequence[ErrorMapTypicalError], subject: Subject
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    stage_dict = {"id": stage.id, "title": stage.title}
    errors = [
        {
            "ruleId": error.rule_id,
            "plainText": error.plain_text,
            "severity": error.severity,
            "studentCount": error.student_count,
        }
        for error in typical_errors
    ]
    context = {
        "subject": subject,
        "level": {
            "level": level.level,
            "share": level.share,
            "attempts": level.attempts,
            "attemptsWithError": level.attempts_with_error,
            "affectedStudents": level.affected_students,
        },
    }
    return stage_dict, errors, context


async def _from_gateway(
    mode: str,
    stage: ErrorMapStage,
    level: ErrorMapStageLevel,
    typical_errors: Sequence[ErrorMapTypicalError],
    subject: Subject,
) -> str | None:
    """Текст от шлюза или `None`: метода нет, шлюз ответил пусто/мусором или упал — любой из этих случаев ведёт к шаблону."""
    explain = getattr(get_gateway(), "explain_stage", None)
    if not callable(explain):
        return None
    try:
        # Реализация может ходить в локальную модель надолго — не блокируем цикл событий.
        raw = await run_in_threadpool(explain, mode, *_gateway_payload(stage, level, typical_errors, subject))
    except Exception:  # noqa: BLE001 — сбой модели не должен ронять разбор этапа
        logger.warning("explain_stage: шлюз не ответил, используется шаблон", exc_info=True)
        return None
    return clean_gateway_text(raw)


async def current_verdict(
    db: AsyncSession, viewer: Viewer | None, *, group_id: str, student_id: str, mode: str, stage_id: str, digest: str
) -> str | None:
    """Вердикт этого преподавателя по показанному тексту; чужие вердикты не читаются."""
    if viewer is None:
        return None
    query = select(ErrorMapVerdict.verdict).where(
        ErrorMapVerdict.teacher_id == viewer.user_id,
        ErrorMapVerdict.group_id == group_id,
        ErrorMapVerdict.student_id == student_id,
        ErrorMapVerdict.mode == mode,
        ErrorMapVerdict.stage_id == stage_id,
        ErrorMapVerdict.text_hash == digest,
    )
    return (await db.execute(query)).scalar_one_or_none()


async def build_explanation(
    db: AsyncSession,
    viewer: Viewer | None,
    *,
    group_id: str,
    student_id: str,
    mode: str,
    stage: ErrorMapStage,
    level: ErrorMapStageLevel,
    typical_errors: Sequence[ErrorMapTypicalError],
    subject: Subject,
) -> ErrorMapExplanation | None:
    """Пояснение этапа с текущим вердиктом преподавателя; `None` — данных мало, пояснять нечего (FR-016)."""
    if level.level == "noData":
        return None
    text = await _from_gateway(mode, stage, level, typical_errors, subject)
    if await flush_external_calls(db, viewer):
        await db.commit()  # разбор этапа — GET: запись аудита иначе не сохранится
    source: Literal["ai", "template"] = "ai"
    if text is None:
        source = "template"
        text = template_text(stage_title=stage.title, typical_errors=typical_errors, subject=subject)
    digest = text_hash(text)
    verdict = await current_verdict(
        db, viewer, group_id=group_id, student_id=student_id, mode=mode, stage_id=stage.id, digest=digest
    )
    return ErrorMapExplanation(
        text=text, source=source, text_hash=digest, verdict=verdict  # type: ignore[arg-type]
    )
