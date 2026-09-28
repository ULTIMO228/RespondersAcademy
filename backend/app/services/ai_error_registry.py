"""Сервис реестра ошибок ai-workflow/1: канонические ID, дедупликация, слияние детекторов и агрегаты (US4, T029)."""

from __future__ import annotations

import base64
import hashlib
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_assessment import ErrorRecord
from app.models.session import Attempt
from app.services.time import now_iso


def canonical_error_id(attempt_id: str, rule_id: str, evidence_key: str, etalon_version: str) -> str:
    """Детерминированный канонический ID по ключу attemptId + ruleId + evidenceKey + etalonVersion."""
    raw = f"{attempt_id.strip()}:{rule_id.strip()}:{evidence_key.strip()}:{etalon_version.strip()}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"err-{digest}"


async def save_error_records(db: AsyncSession, records: list[dict[str, Any]]) -> list[ErrorRecord]:
    """Идемпотентно сохраняет записи ошибок с дедупликацией и слиянием детекторов (T029)."""
    saved: list[ErrorRecord] = []

    for rec in records:
        attempt_id = str(rec["attempt_id"])
        rule_id = str(rec["rule_id"])
        evidence_key = str(rec.get("evidence_key") or f"rule:{rule_id}")
        etalon_version = str(rec["etalon_version"])

        rec_id = rec.get("id") or canonical_error_id(
            attempt_id=attempt_id,
            rule_id=rule_id,
            evidence_key=evidence_key,
            etalon_version=etalon_version,
        )

        # Проверяем существующую запись по уникальному ключу
        stmt = select(ErrorRecord).where(
            ErrorRecord.attempt_id == attempt_id,
            ErrorRecord.rule_id == rule_id,
            ErrorRecord.evidence_key == evidence_key,
            ErrorRecord.etalon_version == etalon_version,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

        incoming_detector = str(rec.get("detector") or "rule")

        if existing is not None:
            # Слияние детектора: rule + ml/llm => llm_confirmed
            if existing.detector == "rule" and incoming_detector in ("ml", "llm", "llm_confirmed"):
                existing.detector = "llm_confirmed"
            elif existing.detector in ("ml", "llm") and incoming_detector == "rule":
                existing.detector = "llm_confirmed"
            elif incoming_detector == "teacher":
                existing.detector = "teacher"
                existing.teacher_id = rec.get("teacher_id")

            if rec.get("fixed") is not None:
                existing.fixed = bool(rec["fixed"])

            saved.append(existing)
        else:
            row = ErrorRecord(
                id=rec_id,
                attempt_id=attempt_id,
                mode=str(rec["mode"]),
                rule_id=rule_id,
                type=str(rec["type"]),
                severity=str(rec["severity"]),
                evidence_key=evidence_key,
                field_path=rec.get("field_path"),
                event_id=rec.get("event_id"),
                observed=str(rec["observed"]),
                expected=str(rec["expected"]) if rec.get("expected") is not None else None,
                source_ref=str(rec["source_ref"]),
                detector=incoming_detector,
                etalon_version=etalon_version,
                assessor_version=rec.get("assessor_version"),
                fixed=bool(rec.get("fixed", False)),
                created_at=rec.get("created_at") or now_iso(),
                teacher_id=rec.get("teacher_id"),
            )
            db.add(row)
            saved.append(row)

    await db.flush()
    return saved


async def add_teacher_error(
    db: AsyncSession,
    attempt_id: str,
    teacher_id: str,
    payload: dict[str, Any],
) -> ErrorRecord:
    """Создает ручную запись ошибки преподавателя с сохранением teacherId (T029)."""
    rec_dict = {
        "attempt_id": attempt_id,
        "mode": payload.get("mode", "dds"),
        "rule_id": payload.get("rule_id", "teacher_custom"),
        "type": payload.get("type", "customError"),
        "severity": payload.get("severity", "major"),
        "evidence_key": payload.get("evidence_key") or f"teacher:{now_iso()}",
        "field_path": payload.get("field_path"),
        "event_id": payload.get("event_id"),
        "observed": str(payload.get("observed", "Ручное замечание преподавателя")),
        "expected": payload.get("expected"),
        "source_ref": payload.get("source_ref", "Замечание преподавателя"),
        "detector": "teacher",
        "etalon_version": payload.get("etalon_version", "etalon-v1"),
        "assessor_version": payload.get("assessor_version", "manual"),
        "fixed": bool(payload.get("fixed", False)),
        "teacher_id": teacher_id,
    }
    saved = await save_error_records(db, [rec_dict])
    return saved[0]


async def list_session_errors(
    db: AsyncSession,
    session_id: str,
    mode: str | None = None,
    student_id: str | None = None,
    error_type: str | None = None,
    severity: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> tuple[list[ErrorRecord], str | None, int]:
    """Возвращает отфильтрованные записи ErrorRecord для занятия с пагинацией курсором (T030)."""
    # Собираем попытки занятия
    stmt_attempts = select(Attempt.id, Attempt.student_id).where(Attempt.session_id == session_id)
    attempt_rows = (await db.execute(stmt_attempts)).all()
    if not attempt_rows:
        return [], None, 0

    attempt_map = {row.id: row.student_id for row in attempt_rows}
    attempt_ids = list(attempt_map.keys())

    query = select(ErrorRecord).where(ErrorRecord.attempt_id.in_(attempt_ids))

    if mode:
        query = query.where(ErrorRecord.mode == mode)
    if student_id:
        target_attempts = [aid for aid, sid in attempt_map.items() if sid == student_id]
        if not target_attempts:
            return [], None, 0
        query = query.where(ErrorRecord.attempt_id.in_(target_attempts))
    if error_type:
        query = query.where(ErrorRecord.type == error_type)
    if severity:
        query = query.where(ErrorRecord.severity == severity)

    # Общее количество подходящих записей
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    # Сортировка: created_at desc, id desc
    query = query.order_by(desc(ErrorRecord.created_at), desc(ErrorRecord.id))

    if cursor:
        try:
            decoded_cursor = base64.b64decode(cursor.encode("utf-8")).decode("utf-8")
            c_created_at, c_id = decoded_cursor.split("|", 1)
            query = query.where(
                (ErrorRecord.created_at < c_created_at)
                | ((ErrorRecord.created_at == c_created_at) & (ErrorRecord.id < c_id))
            )
        except Exception:
            pass

    query = query.limit(limit + 1)
    items = list((await db.execute(query)).scalars().all())

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        last = items[-1]
        next_cursor = base64.b64encode(f"{last.created_at}|{last.id}".encode()).decode("utf-8")

    return items, next_cursor, total


async def get_session_error_summary(
    db: AsyncSession,
    session_id: str,
    mode: str | None = None,
) -> dict[str, Any]:
    """Сводка частот ошибок занятия; пустой сеанс дает честные нули (T031)."""
    stmt_attempts = select(Attempt.id, Attempt.student_id).where(Attempt.session_id == session_id)
    attempt_rows = (await db.execute(stmt_attempts)).all()
    if not attempt_rows:
        return {
            "schema_version": "ai-workflow/1",
            "session_id": session_id,
            "total_errors": 0,
            "by_type": {},
            "by_mode": {"operator112": 0, "dds": 0},
            "by_severity": {"critical": 0, "major": 0, "minor": 0},
            "by_student": {},
            "error_record_ids": [],
        }

    attempt_map = {row.id: row.student_id for row in attempt_rows}
    query = select(ErrorRecord).where(ErrorRecord.attempt_id.in_(list(attempt_map.keys())))
    if mode:
        query = query.where(ErrorRecord.mode == mode)

    records = list((await db.execute(query.order_by(ErrorRecord.id))).scalars().all())

    by_type: dict[str, int] = {}
    by_mode: dict[str, int] = {"operator112": 0, "dds": 0}
    by_severity: dict[str, int] = {"critical": 0, "major": 0, "minor": 0}
    by_student: dict[str, int] = {}

    for rec in records:
        by_type[rec.type] = by_type.get(rec.type, 0) + 1
        if rec.mode in by_mode:
            by_mode[rec.mode] += 1
        if rec.severity in by_severity:
            by_severity[rec.severity] += 1
        student = attempt_map.get(rec.attempt_id)
        if student:
            by_student[student] = by_student.get(student, 0) + 1

    return {
        "schema_version": "ai-workflow/1",
        "session_id": session_id,
        "total_errors": len(records),
        "by_type": by_type,
        "by_mode": by_mode,
        "by_severity": by_severity,
        "by_student": by_student,
        "error_record_ids": [r.id for r in records],
    }


async def get_student_errors(
    db: AsyncSession,
    student_id: str,
    mode: str | None = None,
    error_type: str | None = None,
    severity: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Возвращает ошибки только текущего курсанта, сгруппированные по попыткам (T030)."""
    stmt_attempts = (
        select(Attempt)
        .where(Attempt.student_id == student_id)
        .order_by(desc(Attempt.completed_at), desc(Attempt.id))
    )
    attempts = list((await db.execute(stmt_attempts)).scalars().all())
    if not attempts:
        return {
            "schema_version": "ai-workflow/1",
            "student_id": student_id,
            "attempts": [],
            "total_errors": 0,
        }

    attempt_map = {a.id: a for a in attempts}
    query = select(ErrorRecord).where(ErrorRecord.attempt_id.in_(list(attempt_map.keys())))

    if mode:
        query = query.where(ErrorRecord.mode == mode)
    if error_type:
        query = query.where(ErrorRecord.type == error_type)
    if severity:
        query = query.where(ErrorRecord.severity == severity)

    records = list((await db.execute(query.order_by(desc(ErrorRecord.created_at), desc(ErrorRecord.id)))).scalars().all())

    grouped: dict[str, list[ErrorRecord]] = {}
    for rec in records:
        grouped.setdefault(rec.attempt_id, []).append(rec)

    attempt_items = []
    for att_id, err_list in grouped.items():
        att = attempt_map[att_id]
        attempt_items.append({
            "attempt_id": att.id,
            "card_id": att.card_id,
            "mode": att.mode or "dds",
            "errors": err_list,
        })

    return {
        "schema_version": "ai-workflow/1",
        "student_id": student_id,
        "attempts": attempt_items,
        "total_errors": len(records),
    }
