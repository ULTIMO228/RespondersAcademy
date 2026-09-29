"""Local, repeatable API latency smoke for the Phase 17 thresholds.

Creates and removes its own SQLite database in var/. Run after dependencies and
models are prepared: ``uv run python scripts/perf_smoke.py``.
"""

from __future__ import annotations

import asyncio
import math
import os
import secrets
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATABASE = BACKEND_DIR / "var" / f"perf-smoke-{os.getpid()}.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DATABASE.as_posix()}"
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
os.environ["ML_WARMUP"] = "0"
os.environ["OLLAMA_URL"] = ""

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db.session import get_engine, get_sessionmaker  # noqa: E402
from app.main import create_app, warmup_ml  # noqa: E402
from app.models.scenario import Scenario  # noqa: E402
from app.models.session import Attempt, Evaluation, TrainingSession  # noqa: E402
from app.models.user import User  # noqa: E402
from app.seed.load import run_seed  # noqa: E402
from app.services.time import now_iso  # noqa: E402

STUDENTS = 20
ATTEMPTS_PER_STUDENT = 5
FEED_CLIENTS = 20


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


async def prepare_data() -> tuple[str, str, str, int]:
    await run_seed(reset=True)
    async with get_sessionmaker()() as db:
        students = (await db.execute(select(User).where(User.role == "student").order_by(User.id))).scalars().all()
        teachers = (await db.execute(select(User).where(User.role == "teacher").order_by(User.id))).scalars().all()
        scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)).order_by(Scenario.id))).scalars().all()
        if len(students) < STUDENTS or not teachers:
            raise RuntimeError("Для замера нужно 20 обучаемых и один преподаватель в сиде")
        scenario = next((row for row in scenarios if row.card_ids), None)
        if scenario is None:
            raise RuntimeError("В сиде нет сценария с карточкой")
        now = now_iso()
        session_id = "ses-perf-smoke"
        db.add(TrainingSession(
            id=session_id, teacher_id=teachers[0].id, student_ids=[user.id for user in students[:STUDENTS]],
            scenario_ids=[scenario.id], mode="practice", card_source="generated", card_flow=[],
            state="finished", started_at=now, finished_at=now,
        ))
        count = 0
        for student in students[:STUDENTS]:
            for index in range(ATTEMPTS_PER_STUDENT):
                count += 1
                attempt_id = f"att-perf-{count:03d}"
                db.add(Attempt(
                    id=attempt_id, session_id=session_id, card_id=scenario.card_ids[index % len(scenario.card_ids)],
                    student_id=student.id, mode="dds", opened_at=now, primary_reaction_ms=10_000,
                    statuses=[], services_called=[], completed_at=now, full_processing_ms=90_000,
                    entered_text={"dispatcherAction": "Наряд направлен"}, calls=[], seq=count,
                ))
                db.add(Evaluation(
                    attempt_id=attempt_id, assessor_version="perf-fixture", time_score=80,
                    correctness_score=80, grammar_score=80, semantic_score=80, total_score=80,
                    grammar_errors=[], errors=[], ai_comment="Тестовый балл", components={}, generated_at=now,
                    mode="dds",
                ))
        await db.commit()
        return session_id, scenario.card_ids[0], students[0].id, count


async def measure() -> dict[str, float]:
    session_id, card_id, student_id, count = await prepare_data()
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock", timeout=60.0) as client:
        teacher = await client.post("/auth/login", json={"login": "morozova", "password": "teacher112", "armNumber": 21})
        teacher.raise_for_status()

        start = time.perf_counter()
        report = await client.get("/reports", params={"sessionId": session_id})
        report_ms = (time.perf_counter() - start) * 1000
        report.raise_for_status()
        if count != STUDENTS * ATTEMPTS_PER_STUDENT or len(report.json().get("reports", [])) < STUDENTS:
            raise RuntimeError("Отчёт не содержит 20 обучаемых × 5 попыток")

        async def feed_once() -> float:
            began = time.perf_counter()
            response = await client.get(f"/sessions/{session_id}/feed")
            elapsed = (time.perf_counter() - began) * 1000
            response.raise_for_status()
            return elapsed

        feed_ms = await asyncio.gather(*(feed_once() for _ in range(FEED_CLIENTS)))

        async with get_sessionmaker()() as db:
            db.add(Attempt(
                id="att-perf-new", session_id=session_id, card_id=card_id,
                student_id=student_id,
                mode="dds", opened_at=now_iso(), primary_reaction_ms=10_000,
                statuses=[], services_called=[], completed_at=now_iso(), full_processing_ms=90_000,
                entered_text={"dispatcherAction": "Наряд направлен"}, calls=[], seq=count + 1,
            ))
            await db.commit()
        started = time.perf_counter()
        assessment = await client.get("/attempts/att-perf-new/evaluation")
        assessment_ms = (time.perf_counter() - started) * 1000
        assessment.raise_for_status()
        return {"assessment_ms": assessment_ms, "report_ms": report_ms, "feed_p95_ms": percentile(feed_ms, 0.95), "feed_max_ms": max(feed_ms)}


def main() -> int:
    try:
        print("Прогрев ML вне замера...", flush=True)
        warmup_ml()
        metrics = asyncio.run(measure())
        print(f"Оценка: {metrics['assessment_ms']:.0f} мс (порог 5000)")
        print(f"Отчёт 20 x 5: {metrics['report_ms']:.0f} мс (порог 30000)")
        print(f"Лента, 20 параллельных запросов: p95 {metrics['feed_p95_ms']:.0f} мс, max {metrics['feed_max_ms']:.0f} мс (порог p95 200)")
        return 0 if metrics["assessment_ms"] <= 5000 and metrics["report_ms"] <= 30000 and metrics["feed_p95_ms"] <= 200 else 1
    finally:
        asyncio.run(get_engine().dispose())
        DATABASE.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
