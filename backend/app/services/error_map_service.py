"""Карта ошибок: расчёт уровней этапов и загрузка попыток (фича 003, data-model.md §1, research.md R3, R10).

Ядро (`compute_stage_levels`) — чистая функция без БД и без часов; загрузчик (`load_attempts`) —
единственное место, где сервис ходит в БД.

Определения и границы:

* знаменатель — все учтённые попытки выбранного режима (попытки другого режима отбрасываются ядром);
* числитель этапа — попытки, у которых на этапе есть хотя бы одна ошибка; сколько ошибок на одном этапе
  в одной попытке, не важно: попытка считается один раз (FR-003);
* `share = attemptsWithError / attempts`, 0..1;
* границы уровня: `share < sometimes_from` → `rare`; `sometimes_from <= share <= often_from` → `sometimes`
  (обе границы включительно: ровно 10% и ровно 30% — «иногда»); `share > often_from` → `often`;
* попыток меньше `min_attempts` (само число включительно достаточно) → все этапы `noData`, `share = None`;
* ошибка без `ruleId` (например, истечение лимита времени) и правило вне раскладки режима → этап «Прочее» (FR-007);
* порядок вывода: `share` по убыванию, этапы без `share` в конце, при равенстве — по `order` этапа.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Final, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import not_found
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.schemas.error_map import (
    ErrorMapChainLink,
    ErrorMapHeadline,
    ErrorMapJournalResponse,
    ErrorMapJournalRow,
    ErrorMapResponse,
    ErrorMapScope,
    ErrorMapSeverity,
    ErrorMapStage,
    ErrorMapStageDetail,
    ErrorMapStageLevel,
    ErrorMapStudentRef,
    ErrorMapTypicalError,
    MyFocusItem,
    MyFocusResponse,
    StageComparison,
)
from app.services.error_map_access import require_group_access, require_student_access
from app.services.error_map_explain import build_explanation
from app.services.error_map_settings import ErrorMapSettings, read_error_map_settings
from app.services.error_map_stages import (
    OTHER_STAGE_ID,
    Stage,
    chain_from,
    get_stage,
    rule_plain,
    stage_for_rule,
    stages_for_mode,
)
from app.services.time import MOSCOW, now_iso, to_moscow_iso
from ml.assess.rules import RULES

Level = Literal["rare", "sometimes", "often", "noData"]
Period = Literal["2w", "1m", "all"]

HEADLINE_MAX_STAGES: Final = 3
TYPICAL_ERRORS_MAX: Final = 3
SEVERITY_WEIGHT: Final[Mapping[str, int]] = {"critical": 0, "major": 1, "minor": 2}
DEFAULT_SEVERITY: Final[ErrorMapSeverity] = "major"

PERIOD_DAYS: Final[Mapping[str, int | None]] = {"2w": 14, "1m": 30, "all": None}


@dataclass(frozen=True, slots=True)
class AttemptErrors:
    """Оценённая попытка для расчёта: `errors` — элементы `Evaluation.errors` (ключи `ruleId`, `type`, `severity`, …)."""

    attempt_id: str
    student_id: str
    mode: str
    at: str
    errors: Sequence[Mapping[str, Any]]
    session_id: str | None = None


@dataclass(frozen=True, slots=True)
class StageResult:
    """Уровень одного этапа (StageLevel без `comparison`, который считается на уровне сервиса)."""

    stage: Stage
    attempts: int
    attempts_with_error: int
    share: float | None
    level: Level
    affected_students: int


def level_for_share(share: float, settings: ErrorMapSettings) -> Level:
    if share < settings.sometimes_from:
        return "rare"
    if share > settings.often_from:
        return "often"
    return "sometimes"


def _rule_id(error: Mapping[str, Any]) -> str | None:
    value = error.get("ruleId")
    return value if isinstance(value, str) and value else None


def compute_stage_levels(
    attempts: Iterable[AttemptErrors],
    mode: str,
    settings: ErrorMapSettings,
    *,
    min_attempts: int,
) -> list[StageResult]:
    """Уровни всех этапов режима (включая «Прочее»; показывать ли его пустым — решает вызывающий)."""
    in_mode = [attempt for attempt in attempts if attempt.mode == mode]
    total = len(in_mode)

    attempts_by_stage: dict[str, set[str]] = defaultdict(set)
    students_by_stage: dict[str, set[str]] = defaultdict(set)
    for attempt in in_mode:
        for error in attempt.errors:
            stage = stage_for_rule(mode, _rule_id(error))
            attempts_by_stage[stage.id].add(attempt.attempt_id)
            students_by_stage[stage.id].add(attempt.student_id)

    enough = total >= min_attempts and total > 0
    results: list[StageResult] = []
    for stage in stages_for_mode(mode):
        with_error = len(attempts_by_stage[stage.id]) if stage.id in attempts_by_stage else 0
        if enough:
            share: float | None = with_error / total
            level: Level = level_for_share(share, settings)
        else:
            share, level = None, "noData"
        results.append(
            StageResult(
                stage=stage,
                attempts=total,
                attempts_with_error=with_error,
                share=share,
                level=level,
                affected_students=len(students_by_stage[stage.id]) if stage.id in students_by_stage else 0,
            )
        )
    return sorted(results, key=lambda r: (r.share is None, -(r.share or 0.0), r.stage.order))


def period_cutoff(period: str, now: datetime | None = None) -> str | None:
    """Нижняя граница `generated_at` (включительно) для периода; `all` → None. Время — МСК."""
    if period not in PERIOD_DAYS:
        raise ValueError(f"неизвестный период: {period!r}")
    days = PERIOD_DAYS[period]
    if days is None:
        return None
    moment = now if now is not None else datetime.now(MOSCOW)
    return to_moscow_iso(moment - timedelta(days=days))


async def load_attempts(
    db: AsyncSession,
    group_id: str,
    mode: str,
    period: str,
    *,
    student_id: str | None = None,
    now: datetime | None = None,
) -> list[AttemptErrors]:
    """Оценённые попытки режима у обучающихся группы за период — одним запросом (R10, без N+1).

    С `student_id` берутся только попытки этого обучающегося (карта обучающегося, US3), `group_id` тогда
    не используется. Состав группы — подзапрос `User.group == group_id AND role == 'student'`; попытки без `Evaluation`
    (не оценены) отсекает внутреннее соединение. Граница периода сравнивает строки `generated_at`:
    метки пишутся единым форматом ISO с `+03:00` (`app/services/time.py`), для него порядок строк
    совпадает с порядком времени.
    """
    owners = [Attempt.student_id == student_id] if student_id is not None else [
        Attempt.student_id.in_(select(User.id).where(User.group == group_id, User.role == "student"))
    ]
    query = (
        select(
            Attempt.id, Attempt.student_id, Attempt.mode, Attempt.session_id, Evaluation.generated_at, Evaluation.errors
        )
        .join(Evaluation, Evaluation.attempt_id == Attempt.id)
        .where(*owners, Attempt.mode == mode)
        .order_by(Evaluation.generated_at, Attempt.id)
    )
    cutoff = period_cutoff(period, now)
    if cutoff is not None:
        query = query.where(Evaluation.generated_at >= cutoff)
    rows = (await db.execute(query)).all()
    return [
        AttemptErrors(
            attempt_id=attempt_id,
            student_id=student_id,
            mode=attempt_mode,
            at=generated_at,
            errors=list(errors or []),
            session_id=session_id or None,
        )
        for attempt_id, student_id, attempt_mode, session_id, generated_at, errors in rows
    ]


def _join_titles(titles: Sequence[str]) -> str:
    if len(titles) == 1:
        return titles[0]
    return ", ".join(titles[:-1]) + " и " + titles[-1]


def build_headline(
    results: Sequence[StageResult], *, min_attempts: int, subject: str = "группы"
) -> ErrorMapHeadline:
    """Вывод карты (data-model.md §1 «Headline»).

    `results` уже отсортированы `compute_stage_levels` (share ↓, затем order). В вывод попадают не более
    трёх этапов уровня `often`; «Прочее» не называется — это не этап схемы, а остаток (FR-007).
    """
    if not results or all(result.level == "noData" for result in results):
        return ErrorMapHeadline(
            kind="noData",
            stage_ids=[],
            text=f"Данных пока мало: нужно не менее {min_attempts} оценённых попыток",
        )
    problems = [
        result.stage
        for result in results
        if result.level == "often" and result.stage.id != OTHER_STAGE_ID
    ][:HEADLINE_MAX_STAGES]
    if not problems:
        return ErrorMapHeadline(kind="clean", stage_ids=[], text="Критичных проблем нет")
    lead = "Главная проблема" if len(problems) == 1 else "Главные проблемы"
    return ErrorMapHeadline(
        kind="problems",
        stage_ids=[stage.id for stage in problems],
        text=f"{lead} {subject}: {_join_titles([stage.title for stage in problems])}",
    )


def to_api_level(result: StageResult, comparison: StageComparison | None = None) -> ErrorMapStageLevel:
    return ErrorMapStageLevel(
        stage_id=result.stage.id,
        attempts=result.attempts,
        attempts_with_error=result.attempts_with_error,
        share=result.share,
        level=result.level,
        comparison=comparison,
        affected_students=result.affected_students,
    )


def build_map_parts(results: Sequence[StageResult]) -> tuple[list[ErrorMapStage], list[ErrorMapStageLevel]]:
    """Этапы режима по порядку схемы и их уровни; «Прочее» — только если на нём есть ошибки."""
    shown = [result for result in results if result.stage.id != OTHER_STAGE_ID or result.attempts_with_error > 0]
    stages = [
        ErrorMapStage(id=item.stage.id, order=item.stage.order, title=item.stage.title, article_id=item.stage.article_id)
        for item in sorted(shown, key=lambda r: r.stage.order)
    ]
    return stages, [to_api_level(result) for result in shown]


async def group_map(
    db: AsyncSession,
    viewer: Viewer | None,
    group_id: str,
    mode: Literal["operator112", "dds"],
    period: Literal["2w", "1m", "all"],
) -> ErrorMapResponse:
    """Карта ошибок группы за период; доступ — `require_group_access` (401/403/404)."""
    await require_group_access(db, viewer, group_id)
    settings = await read_error_map_settings(db)
    attempts = await load_attempts(db, group_id, mode, period)
    results = compute_stage_levels(attempts, mode, settings, min_attempts=settings.min_attempts_group)
    stages, levels = build_map_parts(results)
    return ErrorMapResponse(
        scope=ErrorMapScope(kind="group", group_id=group_id, title=group_id),
        mode=mode,
        period=period,
        attempts=len(attempts),
        stages=stages,
        levels=levels,
        headline=build_headline(results, min_attempts=settings.min_attempts_group),
        generated_at=now_iso(),
    )


def _severity(error: Mapping[str, Any], rule_id: str) -> ErrorMapSeverity:
    """Тяжесть ошибки: из оценки; нет — из правила оценщика; иначе `major` (как при записи ошибок оценки)."""
    rule = RULES.get(rule_id)
    for value in (error.get("severity"), rule.severity if rule is not None else None):
        if value == "critical" or value == "major" or value == "minor":
            return value
    return DEFAULT_SEVERITY


@dataclass(slots=True)
class _RuleStats:
    """Накопитель по одному правилу на этапе."""

    severity: ErrorMapSeverity
    students: set[str]
    example: AttemptErrors


def collect_typical_errors(
    attempts: Iterable[AttemptErrors], mode: str, stage_id: str
) -> dict[str, _RuleStats]:
    """Правила, попавшие на этап: тяжесть — наибольшая из встреченных, пример — самая свежая попытка с правилом.

    Ошибки без `ruleId` и правила вне раскладки (этап «Прочее») типовыми не считаются: у них нет формулировки.
    """
    stats: dict[str, _RuleStats] = {}
    for attempt in attempts:
        if attempt.mode != mode:
            continue
        for error in attempt.errors:
            rule_id = _rule_id(error)
            if rule_id is None or stage_for_rule(mode, rule_id).id != stage_id:
                continue
            severity = _severity(error, rule_id)
            entry = stats.get(rule_id)
            if entry is None:
                stats[rule_id] = _RuleStats(severity, {attempt.student_id}, attempt)
                continue
            entry.students.add(attempt.student_id)
            if SEVERITY_WEIGHT[severity] < SEVERITY_WEIGHT[entry.severity]:
                entry.severity = severity
            if (attempt.at, attempt.attempt_id) > (entry.example.at, entry.example.attempt_id):
                entry.example = attempt
    return stats


async def _student_names(db: AsyncSession, group_id: str, student_ids: set[str]) -> dict[str, str]:
    """Имена одним запросом; только обучающиеся этой группы (чужие id не попадают в ответ)."""
    if not student_ids:
        return {}
    query = select(User.id, User.full_name).where(
        User.id.in_(student_ids), User.group == group_id, User.role == "student"
    )
    return {user_id: name for user_id, name in (await db.execute(query)).all()}


async def stage_detail(
    db: AsyncSession,
    viewer: Viewer | None,
    group_id: str,
    stage_id: str,
    mode: Literal["operator112", "dds"],
    period: Literal["2w", "1m", "all"],
) -> ErrorMapStageDetail:
    """Разбор этапа группы (T032): уровень, до трёх типовых ошибок, цепочка и пояснение «почему так» (US6, T056)."""
    await require_group_access(db, viewer, group_id)
    stage = get_stage(mode, stage_id)
    if stage is None:
        raise not_found(f"Этап «{stage_id}» не найден")
    settings = await read_error_map_settings(db)
    attempts = await load_attempts(db, group_id, mode, period)
    results = compute_stage_levels(attempts, mode, settings, min_attempts=settings.min_attempts_group)
    result = next(item for item in results if item.stage.id == stage.id)

    stats = collect_typical_errors(attempts, mode, stage.id)
    ordered = sorted(
        stats.items(),
        key=lambda item: (-len(item[1].students), SEVERITY_WEIGHT[item[1].severity], item[0]),
    )[:TYPICAL_ERRORS_MAX]
    names = await _student_names(db, group_id, {s for _, entry in ordered for s in entry.students})
    typical = [
        ErrorMapTypicalError(
            rule_id=rule_id,
            plain_text=rule_plain(rule_id),
            severity=entry.severity,
            student_count=len(entry.students),
            students=[
                ErrorMapStudentRef(id=student_id, name=names[student_id])
                for student_id in sorted(entry.students, key=lambda sid: (names.get(sid, ""), sid))
                if student_id in names
            ],
            example_attempt_id=entry.example.attempt_id,
            example_session_id=entry.example.session_id,
        )
        for rule_id, entry in ordered
    ]
    api_stage = ErrorMapStage(id=stage.id, order=stage.order, title=stage.title)
    api_level = to_api_level(result)
    explanation = await build_explanation(
        db,
        viewer,
        group_id=group_id,
        student_id="",
        mode=mode,
        stage=api_stage,
        level=api_level,
        typical_errors=typical,
        subject="group",
    )
    return ErrorMapStageDetail(
        stage=api_stage,
        level=api_level,
        typical_errors=typical,
        chain=[ErrorMapChainLink(from_=link.source, to=link.target, caption=link.caption) for link in chain_from(mode, stage.id)],
        explanation=explanation,
    )


def compare_to_group(
    student: StageResult, group: StageResult | None, same_band_points: float
) -> StageComparison | None:
    """Сравнение доли обучающегося с долей группы на этапе (FR-020, data-model.md StageLevel.comparison).

    Нет сравнения, если у обучающегося или у группы на этапе `noData`. Разница считается в процентных
    пунктах и округляется до шести знаков: иначе 0,4 − 0,3 дало бы 10,000000000000004 и граница
    «ровно ±sameBandPoints» (включительно — `same`) промахивалась бы на артефакте двоичной дроби.
    """
    if student.share is None or group is None or group.share is None:
        return None
    diff = round((student.share - group.share) * 100, 6)
    if abs(diff) <= same_band_points:
        return "same"
    return "better" if diff < 0 else "worse"


@dataclass(frozen=True, slots=True)
class _StudentView:
    student: User
    settings: ErrorMapSettings
    attempts: list[AttemptErrors]
    results: list[StageResult]
    comparisons: dict[str, StageComparison]


async def _student_view(
    db: AsyncSession,
    viewer: Viewer | None,
    student_id: str,
    mode: str,
    period: str,
) -> _StudentView:
    """Общая часть карты и разбора обучающегося: доступ, пороги, попытки его и группы, сравнение по этапам."""
    student = await require_student_access(db, viewer, student_id)
    settings = await read_error_map_settings(db)
    attempts = await load_attempts(db, student.group or "", mode, period, student_id=student.id)
    results = compute_stage_levels(attempts, mode, settings, min_attempts=settings.min_attempts_student)
    comparisons: dict[str, StageComparison] = {}
    if student.group and any(result.level != "noData" for result in results):
        group_attempts = await load_attempts(db, student.group, mode, period)
        group_results = {
            result.stage.id: result
            for result in compute_stage_levels(
                group_attempts, mode, settings, min_attempts=settings.min_attempts_group
            )
        }
        for result in results:
            comparison = compare_to_group(result, group_results.get(result.stage.id), settings.same_band_points)
            if comparison is not None:
                comparisons[result.stage.id] = comparison
    return _StudentView(student, settings, attempts, results, comparisons)


async def student_map(
    db: AsyncSession,
    viewer: Viewer | None,
    student_id: str,
    mode: Literal["operator112", "dds"],
    period: Literal["2w", "1m", "all"],
) -> ErrorMapResponse:
    """Карта ошибок обучающегося с сравнением с группой (T040). В ответе — только его данные и агрегат группы."""
    view = await _student_view(db, viewer, student_id, mode, period)
    stages, _ = build_map_parts(view.results)
    shown = {stage.id for stage in stages}
    levels = [
        to_api_level(result, view.comparisons.get(result.stage.id))
        for result in view.results
        if result.stage.id in shown
    ]
    return ErrorMapResponse(
        scope=ErrorMapScope(
            kind="student",
            group_id=view.student.group or "",
            student_id=view.student.id,
            title=view.student.full_name,
        ),
        mode=mode,
        period=period,
        attempts=len(view.attempts),
        stages=stages,
        levels=levels,
        headline=build_headline(view.results, min_attempts=view.settings.min_attempts_student, subject="обучающегося"),
        generated_at=now_iso(),
    )


async def student_stage_detail(
    db: AsyncSession,
    viewer: Viewer | None,
    student_id: str,
    stage_id: str,
    mode: Literal["operator112", "dds"],
    period: Literal["2w", "1m", "all"],
) -> ErrorMapStageDetail:
    """Разбор этапа по одному обучающемуся (T040): его типовые ошибки, пример его попытки и пояснение (US6, T056)."""
    view = await _student_view(db, viewer, student_id, mode, period)
    stage = get_stage(mode, stage_id)
    if stage is None:
        raise not_found(f"Этап «{stage_id}» не найден")
    result = next(item for item in view.results if item.stage.id == stage.id)

    stats = collect_typical_errors(view.attempts, mode, stage.id)
    ordered = sorted(stats.items(), key=lambda item: (SEVERITY_WEIGHT[item[1].severity], item[0]))[:TYPICAL_ERRORS_MAX]
    me = ErrorMapStudentRef(id=view.student.id, name=view.student.full_name)
    typical = [
        ErrorMapTypicalError(
            rule_id=rule_id,
            plain_text=rule_plain(rule_id),
            severity=entry.severity,
            student_count=1,
            students=[me],
            example_attempt_id=entry.example.attempt_id,
            example_session_id=entry.example.session_id,
        )
        for rule_id, entry in ordered
    ]
    api_stage = ErrorMapStage(id=stage.id, order=stage.order, title=stage.title)
    api_level = to_api_level(result, view.comparisons.get(stage.id))
    explanation = await build_explanation(
        db,
        viewer,
        group_id=view.student.group or "",
        student_id=view.student.id,
        mode=mode,
        stage=api_stage,
        level=api_level,
        typical_errors=typical,
        subject="student",
    )
    return ErrorMapStageDetail(
        stage=api_stage,
        level=api_level,
        typical_errors=typical,
        chain=[ErrorMapChainLink(from_=link.source, to=link.target, caption=link.caption) for link in chain_from(mode, stage.id)],
        explanation=explanation,
    )


async def journal(
    db: AsyncSession,
    viewer: Viewer | None,
    group_id: str,
    mode: Literal["operator112", "dds"],
    period: Literal["2w", "1m", "all"],
) -> ErrorMapJournalResponse:
    """Журнал группы «обучающиеся × этапы» (T045): те же значения, что в карте обучающегося, за один проход.

    Попытки группы грузятся одним запросом и раскладываются по обучающимся в памяти; карта обучающегося в цикле
    не вызывается (иначе на каждого — свой запрос, R10). Порог обучающегося — `min_attempts_student`, сравнение —
    с долей группы при `min_attempts_group`, как в `student_map`. В строках все обучающиеся группы, в том числе без
    попыток (серые ячейки). Столбец «Прочее» есть, только если ошибки без этапа есть хотя бы у одного обучающегося.
    Строки идут по имени (без учёта регистра), затем по id: порядок не зависит от коллации базы.
    """
    await require_group_access(db, viewer, group_id)
    settings = await read_error_map_settings(db)
    attempts = await load_attempts(db, group_id, mode, period)
    group_results = {
        result.stage.id: result
        for result in compute_stage_levels(attempts, mode, settings, min_attempts=settings.min_attempts_group)
    }
    by_student: dict[str, list[AttemptErrors]] = defaultdict(list)
    for attempt in attempts:
        by_student[attempt.student_id].append(attempt)

    students = (
        await db.execute(select(User.id, User.full_name).where(User.group == group_id, User.role == "student"))
    ).all()
    ordered = sorted(students, key=lambda item: (item.full_name.casefold(), item.id))

    per_student: list[tuple[str, str, list[AttemptErrors], dict[str, StageResult]]] = []
    for student_id, full_name in ordered:
        own = by_student.get(student_id, [])
        results = compute_stage_levels(own, mode, settings, min_attempts=settings.min_attempts_student)
        per_student.append((student_id, full_name, own, {result.stage.id: result for result in results}))

    show_other = any(
        results[OTHER_STAGE_ID].attempts_with_error > 0 for _, _, _, results in per_student if OTHER_STAGE_ID in results
    )
    shown = [stage for stage in stages_for_mode(mode) if stage.id != OTHER_STAGE_ID or show_other]
    stages = [
        ErrorMapStage(id=stage.id, order=stage.order, title=stage.title, article_id=stage.article_id)
        for stage in sorted(shown, key=lambda item: item.order)
    ]
    rows = []
    for student_id, full_name, own, results in per_student:
        levels = []
        for stage in stages:
            result = results[stage.id]
            comparison = compare_to_group(result, group_results.get(stage.id), settings.same_band_points)
            levels.append(to_api_level(result, comparison))
        rows.append(ErrorMapJournalRow(student_id=student_id, name=full_name, attempts=len(own), levels=levels))
    return ErrorMapJournalResponse(mode=mode, period=period, group_id=group_id, stages=stages, rows=rows)


FOCUS_MAX: Final = 3
FOCUS_PERIOD: Final = "1m"
FOCUS_NO_ERRORS: Final = "Пока замечаний нет"
FOCUS_NEED_MORE: Final = "Пройдите ещё несколько тренировок, чтобы здесь появились подсказки"


async def my_focus(db: AsyncSession, viewer: Viewer) -> MyFocusResponse:
    """«Над чем поработать» (US7, FR-020): до трёх этапов самого обучающегося, без групповых данных и сравнений.

    Режим — тот, где у обучающегося больше оценённых попыток за месяц (при равенстве — ДДС). В блок попадают этапы с
    уровнем «иногда» и «часто», по убыванию доли ошибок; подсказка — нейтральный шаблон без оценок.
    """
    settings = await read_error_map_settings(db)
    by_mode = {
        mode: await load_attempts(db, "", mode, FOCUS_PERIOD, student_id=viewer.user_id) for mode in ("dds", "operator112")
    }
    if not any(by_mode.values()):
        return MyFocusResponse(mode=None, items=[], message=FOCUS_NEED_MORE)
    mode: Literal["dds", "operator112"] = "operator112" if len(by_mode["operator112"]) > len(by_mode["dds"]) else "dds"
    results = compute_stage_levels(by_mode[mode], mode, settings, min_attempts=settings.min_attempts_student)
    if all(result.level == "noData" for result in results):
        return MyFocusResponse(mode=mode, items=[], message=FOCUS_NEED_MORE)
    problems = sorted(
        (r for r in results if r.level in ("sometimes", "often")),
        key=lambda r: (-(r.share or 0.0), r.stage.order),
    )[:FOCUS_MAX]
    if not problems:
        return MyFocusResponse(mode=mode, items=[], message=FOCUS_NO_ERRORS)
    items = [
        MyFocusItem(
            stage_id=r.stage.id,
            title=r.stage.title,
            hint=f"Повторите тему «{r.stage.title}» и пройдите тренировку по ней.",
        )
        for r in problems
    ]
    return MyFocusResponse(mode=mode, items=items)
