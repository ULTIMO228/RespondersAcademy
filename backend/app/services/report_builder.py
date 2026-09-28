"""Отчёты занятия: сборка по попыткам, живой балл с учётом правок, журнал, обратная связь.

Порт `src/shared/api/mock/{reports,reports-runtime,reports-score,reports-journal,reports-teacher}.ts`:
- отчёт формируется по завершённому занятию (`finished`/`reported`) один раз (маркер — `group_reports`);
  статические отчёты сидов (`static=true`) не пересобираются; незавершённое занятие → `reports: []`;
- `Report.score` и `charts.dynamics` пересчитываются при чтении по оценкам попыток (override приоритетен);
- `buildSec` журнала = `generatedAt − finishedAt`.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.api.deps import Viewer, resolve_student_scope
from app.api.errors import forbidden, not_found, validation_failed
from app.db.ids import group_report_id, report_id
from app.models.card import IncidentCard
from app.models.report import GroupReport, Report, ReportFeedback
from app.models.scenario import Scenario
from app.models.session import Attempt, TrainingSession
from app.models.user import User
from app.services.evaluation_service import _read_teacher, evaluate_if_possible, find_scenario_for_attempt
from app.services.session_engine import evaluation_contract, list_session_rows, require_session_row
from app.services.time import now_iso, parse_iso_ms
from ml.assess.engine import resolve_time_norms

REPORTABLE_STATES = ("finished", "reported")
STAGE_REACTION = "Первичная реакция"
STAGE_PROCESSING = "Полная отработка"
STAGES = (STAGE_REACTION, STAGE_PROCESSING)
EXPORT_FORMATS = ["csv", "pdf"]
GRAMMAR_TYPES = ("spelling", "syntax")
SEVERITIES = ("critical", "major", "minor")
CRITERIA = ["Время", "Корректность", "Грамматика", "Смысл"]
NO_ATTEMPTS_COMMENT = "Нет данных по попыткам: курсант не завершил ни одной карточки занятия. Оценка не формировалась — назначьте повторное занятие."
JOURNAL_TEACHER_ONLY_MESSAGE = "Журнал отчётов доступен преподавателю и администратору"
ISO_DATE_LENGTH = 10


# ─── Вспомогательные ──────────────────────────────────────────────────────────────────────────────


def effective_score(evaluation: dict[str, Any] | None) -> int | None:
    if not evaluation:
        return None
    override = evaluation.get("teacherOverride")
    return int(override["score"]) if override and "score" in override else int(evaluation["totalScore"])


def average_floor(values: list[int]) -> int:
    return int(sum(values) // len(values)) if values else 0


def _count_by(keys: tuple[str, ...], values: list[str]) -> dict[str, int]:
    counts = {key: 0 for key in keys}
    for value in values:
        if value in counts:
            counts[value] += 1
    return counts


def _last_name(full_name: str) -> str:
    return full_name.split(" ")[0] or full_name


def _is_completed(attempt: Attempt) -> bool:
    return bool(attempt.completed_at) and attempt.full_processing_ms > 0


# ─── Сборка ───────────────────────────────────────────────────────────────────────────────────────


async def _norms_for(db: AsyncSession, session: TrainingSession, attempt: Attempt, cache: dict[str, dict[str, int]]) -> dict[str, int]:
    if attempt.card_id in cache:
        return cache[attempt.card_id]
    scenario: Scenario | None = await find_scenario_for_attempt(db, attempt, session)
    norms = resolve_time_norms(scenario.to_contract() if scenario else None, (session.plan or {}).get("timeNorms"))
    cache[attempt.card_id] = {"primaryReactionMs": norms.primary_reaction_ms, "fullProcessingMs": norms.full_processing_ms}
    return cache[attempt.card_id]


async def _score_student_attempts(db: AsyncSession, session: TrainingSession, student_id: str, groups: dict[str, str], norms_cache: dict[str, dict[str, int]]) -> list[dict[str, Any]]:
    rows = (await db.execute(select(Attempt).where(Attempt.session_id == session.id, Attempt.student_id == student_id).order_by(Attempt.seq, Attempt.id))).scalars().all()
    scored: list[dict[str, Any]] = []
    for attempt in rows:
        if not _is_completed(attempt):
            continue
        evaluation = await evaluate_if_possible(db, attempt)
        if evaluation is None:
            continue
        card = await db.get(IncidentCard, attempt.card_id)
        scored.append({"attempt": attempt.to_contract(), "evaluation": evaluation, "norms": await _norms_for(db, session, attempt, norms_cache), "score": effective_score(evaluation), "group": groups.get(attempt.card_id, ""), "errors": evaluation.get("errors", []), "sourceAttemptId": card.source_attempt_id if card else None})
    return scored


def _time_metrics(scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
    metrics = []
    for item in scored:
        attempt, norms = item["attempt"], item["norms"]
        metrics.append({"cardId": attempt["cardId"], "stage": STAGE_REACTION, "normMs": norms["primaryReactionMs"], "factMs": attempt["primaryReactionMs"], "deviationMs": attempt["primaryReactionMs"] - norms["primaryReactionMs"]})
        metrics.append({"cardId": attempt["cardId"], "stage": STAGE_PROCESSING, "normMs": norms["fullProcessingMs"], "factMs": attempt["fullProcessingMs"], "deviationMs": attempt["fullProcessingMs"] - norms["fullProcessingMs"]})
    return metrics


def _report_ai_comment(scored: list[dict[str, Any]], errors: list[dict[str, Any]]) -> str:
    if not scored:
        return NO_ATTEMPTS_COMMENT
    exceeded = sum(1 for i in scored if i["attempt"]["primaryReactionMs"] > i["norms"]["primaryReactionMs"] or i["attempt"]["fullProcessingMs"] > i["norms"]["fullProcessingMs"])
    timing = "Нормативы времени соблюдены." if exceeded == 0 else f"Нормативы времени превышены в {exceeded} из {len(scored)} попыток."
    critical = sum(1 for e in errors if e.get("severity") == "critical")
    remarks = "Замечаний по эталону нет." if not errors else f"Замечаний: {len(errors)}, из них критичных {critical}."
    return f"ИИ-разбор: отработано карточек — {len(scored)}. {timing} {remarks}"


def build_student_report(session: TrainingSession, student: User | None, student_id: str, scored: list[dict[str, Any]], generated_at: str) -> dict[str, Any]:
    errors = [{"cardId": i["attempt"]["cardId"], **{k: e[k] for k in ("type", "severity", "message") if k in e}} for i in scored for e in i["evaluation"].get("errors", [])]
    grammar_errors = [{"cardId": i["attempt"]["cardId"], **e} for i in scored for e in i["evaluation"].get("grammarErrors", [])]
    norms = scored[0]["norms"] if scored else {"primaryReactionMs": 30_000, "fullProcessingMs": 180_000}
    return {
        "id": report_id(session.id, student_id),
        "sessionId": session.id,
        "generatedAt": generated_at,
        "exportFormats": list(EXPORT_FORMATS),
        "student": {"studentId": student_id, "fullName": student.full_name if student else student_id, "armNumber": student.arm_number if student else 0},
        "timeMetrics": _time_metrics(scored),
        "grammarErrors": grammar_errors,
        "errors": errors,
        "chainLinks": [{"sourceAttemptId": i["sourceAttemptId"], "ddsAttemptId": i["attempt"]["id"], "cardId": i["attempt"]["cardId"]} for i in scored if i.get("sourceAttemptId")],
        "score": average_floor([i["score"] for i in scored]),
        "charts": {
            "byStage": {"stages": list(STAGES), "normMs": [norms["primaryReactionMs"], norms["fullProcessingMs"]], "attempts": [{"attemptId": i["attempt"]["id"], "cardId": i["attempt"]["cardId"], "factMs": [i["attempt"]["primaryReactionMs"], i["attempt"]["fullProcessingMs"]]} for i in scored]},
            "byErrorType": {"grammar": _count_by(GRAMMAR_TYPES, [e["type"] for e in grammar_errors]), "errors": _count_by(SEVERITIES, [e["severity"] for e in errors])},
            "dynamics": {"labels": [i["attempt"]["id"] for i in scored], "scores": [i["score"] for i in scored]},
        },
        "aiComment": _report_ai_comment(scored, errors),
    }


def _errors_by_criterion(reports: list[dict[str, Any]]) -> list[int]:
    counts = [0, 0, 0, 0]
    for report in reports:
        for error in report["errors"]:
            kind = str(error.get("type", ""))
            if kind.startswith("time"):
                counts[0] += 1
            elif kind.startswith("grammar") or kind.startswith("address"):
                counts[2] += 1
            elif kind in ("keyPhraseMissing", "incompleteComment", "missingComment", "reportIncomplete"):
                counts[3] += 1
            else:
                counts[1] += 1
        counts[2] += len(report["grammarErrors"])
    return counts


def build_group_report(session: TrainingSession, built: list[dict[str, Any]], generated_at: str, insights: list[str]) -> dict[str, Any]:
    with_attempts = [b for b in built if b["attempts"]]
    norms = with_attempts[0]["attempts"][0]["norms"] if with_attempts else {"primaryReactionMs": 30_000, "fullProcessingMs": 180_000}
    attempts = [a for b in with_attempts for a in b["attempts"]]
    norm_sec = round(norms["primaryReactionMs"] / 1000)
    return {
        "id": group_report_id(session.id),
        "sessionId": session.id,
        "generatedAt": generated_at,
        "reportIds": [b["report"]["id"] for b in built],
        "groupInsights": insights,
        "charts": {
            "scoreByStudent": {"kind": "bar", "title": "Интегральный балл по курсантам", "series": {"labels": [_last_name(b["report"]["student"]["fullName"]) for b in with_attempts], "values": [b["report"]["score"] for b in with_attempts]}},
            "reactionByAttempt": {"kind": "line", "title": f"Время реакции по попыткам (норматив {norm_sec} с)", "series": {"labels": [a["attempt"]["id"] for a in attempts], "values": [round(a["attempt"]["primaryReactionMs"] / 1000) for a in attempts], "norm": norm_sec}},
            "errorsByCriterion": {"kind": "heatmap", "title": "Ошибки по критериям оценки", "series": {"criteria": list(CRITERIA), "errors": _errors_by_criterion([b["report"] for b in built])}},
        },
    }


async def has_reports(db: AsyncSession, session_id: str) -> bool:
    return (await db.execute(select(GroupReport.id).where(GroupReport.session_id == session_id))).scalar_one_or_none() is not None or (await db.execute(select(Report.id).where(Report.session_id == session_id, Report.static.is_(True)))).first() is not None


async def build_session_report(db: AsyncSession, session_id: str) -> None:
    """Идемпотентная сборка: ничего не делает для статики, незавершённого занятия и уже собранного отчёта."""
    session = await db.get(TrainingSession, session_id)
    if session is None or session.state not in REPORTABLE_STATES or await has_reports(db, session_id):
        return
    generated_at = now_iso()
    groups = {cid: group for cid, group in (await db.execute(select(IncidentCard.id, IncidentCard.group))).all()}
    norms_cache: dict[str, dict[str, int]] = {}
    built = []
    for student_id in session.student_ids or []:
        student = await db.get(User, student_id)
        scored = await _score_student_attempts(db, session, student_id, groups, norms_cache)
        built.append({"report": build_student_report(session, student, student_id, scored, generated_at), "attempts": scored})
    insights = get_gateway().group_insights({"id": session.id}, [{**b["report"], "attempts": b["attempts"]} for b in built])
    group = build_group_report(session, built, generated_at, insights)
    for item in built:
        doc = item["report"]
        db.add(Report(id=doc["id"], session_id=session.id, student_id=doc["student"]["studentId"], generated_at=generated_at, export_formats=doc["exportFormats"], student=doc["student"], time_metrics=doc["timeMetrics"], grammar_errors=doc["grammarErrors"], errors=doc["errors"], score=doc["score"], charts=doc["charts"], ai_comment=doc["aiComment"], static=False))
    db.add(GroupReport(id=group["id"], session_id=session.id, generated_at=generated_at, report_ids=group["reportIds"], group_insights=group["groupInsights"], charts=group["charts"], static=False))
    await db.flush()


async def ensure_student_reports(db: AsyncSession, student_id: str) -> None:
    for session in await list_session_rows(db):
        if student_id in (session.student_ids or []):
            await build_session_report(db, session.id)


# ─── Чтение ───────────────────────────────────────────────────────────────────────────────────────


async def live_report(db: AsyncSession, row: Report) -> dict[str, Any]:
    """Живой отчёт: балл и dynamics по оценкам попыток (override приоритетен) + обратная связь."""
    report = row.to_contract()
    attempts = (await db.execute(select(Attempt).where(Attempt.session_id == row.session_id, Attempt.student_id == row.student_id).order_by(Attempt.seq, Attempt.id))).scalars().all()
    scored = []
    for attempt in attempts:
        score = effective_score(await evaluation_contract(db, attempt.id))
        if score is not None:
            scored.append((attempt.id, score))
    if scored:
        report["score"] = average_floor([s for _, s in scored])
        report["charts"] = {**report["charts"], "dynamics": {"labels": [a for a, _ in scored], "scores": [s for _, s in scored]}}
    feedback = await db.get(ReportFeedback, row.id)
    if feedback is not None:
        report["teacherFeedback"] = feedback.to_contract()
    return report


async def get_reports(db: AsyncSession, viewer: Viewer | None, session_id: str | None, student_id: str | None) -> dict[str, Any]:
    scope = resolve_student_scope(viewer, student_id)
    if not session_id and not scope:
        raise validation_failed("Укажите параметр «sessionId» или «studentId»")
    if session_id:
        await require_session_row(db, session_id)
        await build_session_report(db, session_id)
    elif scope:
        await ensure_student_reports(db, scope)
    query = select(Report).order_by(Report.id)
    if session_id:
        query = query.where(Report.session_id == session_id)
    if scope:
        query = query.where(Report.student_id == scope)
    rows = (await db.execute(query)).scalars().all()
    reports = [await live_report(db, row) for row in rows]
    group_report = None
    if session_id and not scope:
        group_row = (await db.execute(select(GroupReport).where(GroupReport.session_id == session_id))).scalar_one_or_none()
        if group_row is not None:
            group_report = group_row.to_contract([r["id"] for r in reports])
    return {"reports": reports, "groupReport": group_report}


def _build_sec(generated_at: str | None, finished_at: str | None) -> int | None:
    if not generated_at or not finished_at:
        return None
    elapsed = parse_iso_ms(generated_at) - parse_iso_ms(finished_at)
    return None if elapsed < 0 else int(round(elapsed / 1000))


async def _journal_row(db: AsyncSession, session: TrainingSession, users: dict[str, User], groups: dict[str, str]) -> dict[str, Any]:
    reports = [await live_report(db, r) for r in (await db.execute(select(Report).where(Report.session_id == session.id).order_by(Report.id))).scalars().all()]
    group_row = (await db.execute(select(GroupReport).where(GroupReport.session_id == session.id))).scalar_one_or_none()
    scores = [r["score"] for r in reports]
    generated_at = group_row.generated_at if group_row else (reports[0]["generatedAt"] if reports else None)
    student_groups: list[str] = []
    for sid in session.student_ids or []:
        user = users.get(sid)
        if user and user.group and user.group not in student_groups:
            student_groups.append(user.group)
    categories: list[str] = []
    for item in session.card_flow or []:
        group = groups.get(item.get("cardId", ""))
        if group and group not in categories:
            categories.append(group)
    return {
        "sessionId": session.id,
        "teacherId": session.teacher_id,
        "teacherName": users[session.teacher_id].full_name if session.teacher_id in users else session.teacher_id,
        "startedAt": session.started_at,
        "finishedAt": session.finished_at,
        "groups": student_groups,
        "categories": categories,
        "students": [{"id": sid, "fullName": users[sid].full_name if sid in users else sid} for sid in session.student_ids or []],
        "averageScore": int(round(sum(scores) / len(scores))) if scores else None,
        "status": "ready" if group_row else "draft",
        "mode": session.mode,
        "cardSource": session.card_source,
        "generatedAt": generated_at,
        "buildSec": _build_sec(generated_at, session.finished_at),
    }


def _matches(row: dict[str, Any], query: dict[str, str | None]) -> bool:
    date = str(row["startedAt"])[:ISO_DATE_LENGTH]
    return (
        (not query.get("studentId") or any(s["id"] == query["studentId"] for s in row["students"]))
        and (not query.get("group") or query["group"] in row["groups"])
        and (not query.get("category") or query["category"] in row["categories"])
        and (not query.get("from") or date >= query["from"])
        and (not query.get("to") or date <= query["to"])
    )


async def get_journal(db: AsyncSession, viewer: Viewer | None, query: dict[str, str | None]) -> dict[str, Any]:
    if viewer is not None and viewer.is_student:
        raise forbidden(JOURNAL_TEACHER_ONLY_MESSAGE)
    sessions = await list_session_rows(db)
    for session in sessions:
        await build_session_report(db, session.id)
    users = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    groups = {cid: group for cid, group in (await db.execute(select(IncidentCard.id, IncidentCard.group))).all()}
    rows = [await _journal_row(db, s, users, groups) for s in sessions if not query.get("teacherId") or s.teacher_id == query["teacherId"]]
    rows.sort(key=lambda r: r["startedAt"], reverse=True)
    students: dict[str, dict[str, str]] = {}
    for row in rows:
        for student in row["students"]:
            students.setdefault(student["id"], student)
    filters = {
        "groups": list(dict.fromkeys(g for r in rows for g in r["groups"])),
        "students": list(students.values()),
        "categories": list(dict.fromkeys(c for r in rows for c in r["categories"])),
    }
    return {"rows": [r for r in rows if _matches(r, query)], "filters": filters}


async def save_feedback(db: AsyncSession, viewer: Viewer | None, body: dict[str, Any]) -> dict[str, Any]:
    if viewer is not None and viewer.is_student:
        raise forbidden("Действие доступно преподавателю и администратору")
    teacher = await _read_teacher(db, body, viewer)
    report_id_value = body.get("reportId")
    report_id_value = report_id_value.strip() if isinstance(report_id_value, str) else ""
    report = await db.get(Report, report_id_value) if report_id_value else None
    if report is None:
        raise not_found(f"Отчёт «{report_id_value}» не найден")
    text = body.get("text")
    text = text.strip() if isinstance(text, str) else ""
    if not text:
        raise validation_failed("Комментарий к результату обязателен")
    recommendations = body.get("recommendations")
    if recommendations is None:
        recommendations = []
    if not isinstance(recommendations, list) or any(not isinstance(r, str) for r in recommendations):
        raise validation_failed("«recommendations» — список строк")
    recommendations = [r.strip() for r in recommendations if r.strip()]
    row = await db.get(ReportFeedback, report.id)
    values = {"session_id": report.session_id, "student_id": report.student_id, "teacher_id": teacher.id, "teacher_name": teacher.full_name, "text": text, "recommendations": recommendations, "at": now_iso()}
    if row is None:
        row = ReportFeedback(report_id=report.id, **values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    await db.flush()
    return row.to_contract()
