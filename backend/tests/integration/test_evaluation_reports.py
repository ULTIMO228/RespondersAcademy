"""T050 (фича 007, US4): отчёт занятия включает попытки 112, связанные с заданием по assignment_id.

Попытка 112 создаётся с пустым `session_id`; связь с занятием — `AssignmentAttempt(assignment_id)` и
`TrainingSession.mode == "assignment:<id>"` (`report_builder._score_student_attempts`). Строки с нормативами
несут `normScope`: `operator112` для попыток 112, `dds` для попыток ДДС. Данные — прямой INSERT в откатываемой
транзакции (как в `test_chain.py`), сборка — `build_session_report`.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import IncidentCard
from app.models.report import Report
from app.models.session import Attempt, Evaluation, TrainingSession
from app.services.report_builder import STAGE_PROCESSING, STAGE_REACTION, build_session_report

TEACHER_ID = "u-002"
STUDENT_ID = "u-005"
ASSIGNMENT_ID = "asg-t050"
FOREIGN_ASSIGNMENT_ID = "asg-t050-x"
SESSION_ID = "ses-t050-chain"
STARTED_AT = "2026-10-20T10:00:00+03:00"
DONE_AT = "2026-10-20T10:05:00+03:00"
CARD_112 = "c-t050-112"
CARD_DDS = "c-t050-dds"
ATTEMPT_112 = "att-t050-112"
ATTEMPT_DDS = "att-t050-dds"
ATTEMPT_FOREIGN = "att-t050-fx"
ATTEMPT_UNLINKED = "att-t050-free"


def _card(card_id: str, ticket_no: int) -> IncidentCard:
    return IncidentCard(
        id=card_id,
        ticket_no=ticket_no,
        situation_no=1,
        group="Водоснабжение",
        summary="Прорыв трубы",
        address="Москва, Дубнинская, 2",
        caller={"name": "Иванов"},
        expected_services=["Мосводоканал"],
        expected_tags=[],
        mode_origin="seed",
    )


def _assignment(assignment_id: str, training_mode: str, card_id: str) -> Assignment:
    return Assignment(
        id=assignment_id,
        teacher_id=TEACHER_ID,
        student_ids=[STUDENT_ID],
        training_mode=training_mode,
        format="training",
        card_ids=[card_id],
        params={},
        state="active",
        created_at=STARTED_AT,
        title=f"T050 {training_mode}",
    )


def _attempt(
    attempt_id: str, *, session_id: str, card_id: str, mode: str, reaction_ms: int, processing_ms: int
) -> Attempt:
    return Attempt(
        id=attempt_id,
        session_id=session_id,
        card_id=card_id,
        student_id=STUDENT_ID,
        mode=mode,
        opened_at=STARTED_AT,
        primary_reaction_ms=reaction_ms,
        statuses=[],
        services_called=[],
        completed_at=DONE_AT,
        full_processing_ms=processing_ms,
        entered_text={},
        calls=[],
        seq=0,
        state="submitted",
        events=[],
    )


def _evaluation(attempt_id: str, mode: str, total: int) -> Evaluation:
    return Evaluation(
        attempt_id=attempt_id,
        assessor_version="t050",
        time_score=total,
        correctness_score=total,
        grammar_score=total,
        semantic_score=total,
        total_score=total,
        grammar_errors=[],
        errors=[],
        ai_comment="",
        components={},
        generated_at=DONE_AT,
        passed=None,
        mode=mode,
    )


def _link(assignment_id: str, attempt_id: str, card_id: str) -> AssignmentAttempt:
    return AssignmentAttempt(
        assignment_id=assignment_id,
        student_id=STUDENT_ID,
        card_id=card_id,
        attempt_id=attempt_id,
        replays=0,
        hints_shown=0,
        state="submitted",
    )


async def _seed_chain_session(db, *, with_foreign_rows: bool = False) -> None:
    """Занятие цепочки: попытка 112 по заданию (session_id пуст) и попытка ДДС в занятии; опционально — чужие попытки 112."""
    db.add_all(
        [
            _card(CARD_112, 9501),
            _card(CARD_DDS, 9502),
            _assignment(ASSIGNMENT_ID, "chain", CARD_112),
            TrainingSession(
                id=SESSION_ID,
                teacher_id=TEACHER_ID,
                student_ids=[STUDENT_ID],
                scenario_ids=[],
                mode=f"assignment:{ASSIGNMENT_ID}",
                card_source="studentCreated",
                card_flow=[],
                state="finished",
                started_at=STARTED_AT,
                finished_at=DONE_AT,
                plan={},
                parked=[],
                training_mode="chain",
                format="training",
            ),
            _attempt(
                ATTEMPT_112,
                session_id="",
                card_id=CARD_112,
                mode="operator112",
                reaction_ms=5_000,
                processing_ms=90_000,
            ),
            _attempt(
                ATTEMPT_DDS,
                session_id=SESSION_ID,
                card_id=CARD_DDS,
                mode="dds",
                reaction_ms=12_000,
                processing_ms=150_000,
            ),
            _evaluation(ATTEMPT_112, "operator112", 80),
            _evaluation(ATTEMPT_DDS, "dds", 60),
            _link(ASSIGNMENT_ID, ATTEMPT_112, CARD_112),
            _link(ASSIGNMENT_ID, ATTEMPT_DDS, CARD_DDS),
        ]
    )
    if with_foreign_rows:
        db.add_all(
            [
                _assignment(FOREIGN_ASSIGNMENT_ID, "operator112", CARD_112),
                _attempt(
                    ATTEMPT_FOREIGN,
                    session_id="",
                    card_id=CARD_112,
                    mode="operator112",
                    reaction_ms=4_000,
                    processing_ms=80_000,
                ),
                _evaluation(ATTEMPT_FOREIGN, "operator112", 10),
                _link(FOREIGN_ASSIGNMENT_ID, ATTEMPT_FOREIGN, CARD_112),
                # Завершённая попытка 112 без связи с заданием: в отчёт занятия не попадает.
                _attempt(
                    ATTEMPT_UNLINKED,
                    session_id="",
                    card_id=CARD_112,
                    mode="operator112",
                    reaction_ms=4_000,
                    processing_ms=80_000,
                ),
                _evaluation(ATTEMPT_UNLINKED, "operator112", 20),
            ]
        )
    await db.flush()


async def test_session_report_includes_112_attempts_of_assignment_with_norm_scope(app):
    async with get_sessionmaker()() as db:
        try:
            await _seed_chain_session(db)
            await build_session_report(db, SESSION_ID)
            report = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalar_one()

            # Балл курсанта — среднее по обеим попыткам: попытка 112 учитывается (80 и 60 → 70).
            assert report.score == 70
            assert sorted(report.charts["dynamics"]["labels"]) == sorted([ATTEMPT_112, ATTEMPT_DDS])
            assert {
                item["attemptId"]: item["normScope"] for item in report.charts["byStage"]["attempts"]
            } == {
                ATTEMPT_112: "operator112",
                ATTEMPT_DDS: "dds",
            }
            # Каждая строка норматива подписана режимом, к которому относится.
            assert {(row["cardId"], row["stage"]): row["normScope"] for row in report.time_metrics} == {
                (CARD_112, STAGE_REACTION): "operator112",
                (CARD_112, STAGE_PROCESSING): "operator112",
                (CARD_DDS, STAGE_REACTION): "dds",
                (CARD_DDS, STAGE_PROCESSING): "dds",
            }
        finally:
            await db.rollback()


async def test_session_report_excludes_112_attempts_of_other_or_no_assignment(app):
    async with get_sessionmaker()() as db:
        try:
            await _seed_chain_session(db, with_foreign_rows=True)
            await build_session_report(db, SESSION_ID)
            report = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalar_one()

            # Попытки 112 чужого задания и без задания не входят: балл и строки — только 112 и ДДС этого занятия.
            assert report.score == 70
            assert {item["attemptId"] for item in report.charts["byStage"]["attempts"]} == {
                ATTEMPT_112,
                ATTEMPT_DDS,
            }
            assert {row["cardId"] for row in report.time_metrics} == {CARD_112, CARD_DDS}
            assert len(report.time_metrics) == 4  # по два норматива на каждую из двух попыток занятия
        finally:
            await db.rollback()
