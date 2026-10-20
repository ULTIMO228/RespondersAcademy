"""Фича 006, T028: ИИ-тексты в сборке отчёта занятия (`report_builder.build_session_report`).

Сеть не используется: `ml.generate.llm.complete_json` подменяется (monkeypatch), исходы строятся вручную.
Сессия `ses-2026-09-16-01` в сидах — `finished` со статическими отчётами: перед сборкой они удаляются, изменения
откатываются в конце теста (общая in-memory БД сидов не должна меняться между тестами).
"""

from __future__ import annotations

import re
import time
from typing import Any

import pytest
from sqlalchemy import delete, select

from app.api.deps import Viewer
from app.db.session import get_sessionmaker
from app.models.report import GroupReport, Report
from app.services import report_ai_text as rat
from app.services import report_builder
from ml.generate import llm
from ml.insights.group_insights import build_insights

SESSION_ID = "ses-2026-09-16-01"
GOOD_COMMENT = "Курсанты уложились в нормативы, замечания по эталону единичные и некритичные."
GOOD_INSIGHT = "Половина группы допустила ошибку в адресе, стоит повторить адресные карточки."
GOOD_REC = "Повторите эту тему: на тренировке это поможет быстрее принимать первичное решение."
TEACHER = Viewer("u-002", "teacher")
_KEY = re.compile(r"key=([^;\n]+);")


class FakeModel:
    """Подмена `complete_json`: отвечает по назначению, считает вызовы и запоминает контекст запроса."""

    def __init__(self, *, source: str = "local", delay: float = 0.0, answer: bool = True) -> None:
        self.source, self.delay, self.answer = source, delay, answer
        self.calls: list[str] = []
        self.contexts: list[object] = []

    def __call__(self, purpose: str, system: str, user: str, schema: dict[str, Any], **kwargs: Any) -> llm.LlmOutcome:
        self.calls.append(purpose)
        self.contexts.append(llm.current_context())
        if self.delay:
            time.sleep(self.delay)
        size = len(system) + len(user)
        if not self.answer:
            return llm.LlmOutcome(None, "template", None, "bad_response", purpose, "local", size)
        if purpose == "report_comment":
            data: dict[str, Any] | None = {"text": GOOD_COMMENT}
        elif purpose == "report_group_insights":
            data = {"items": [GOOD_INSIGHT]}
        elif purpose == "recommendation_text":
            data = {"items": [{"key": key, "text": GOOD_REC} for key in _KEY.findall(user)]}
        else:
            data = None
        provider = llm.CLOUD_PROVIDER if self.source == "cloud" else "llamacpp:qwen"
        active = "cloud" if self.source == "cloud" else "local"
        return llm.LlmOutcome(data, self.source, provider, None, purpose, active, size)  # type: ignore[arg-type]


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(llm, "complete_json", fake)
    return fake


async def _rebuild(db) -> None:
    """Сбрасывает статические отчёты занятия (в транзакции теста) и собирает отчёт заново."""
    await db.execute(delete(Report).where(Report.session_id == SESSION_ID))
    await db.execute(delete(GroupReport).where(GroupReport.session_id == SESSION_ID))
    await report_builder.build_session_report(db, SESSION_ID)


async def test_built_report_stores_model_text_and_source(model: FakeModel, ai_env):
    async with get_sessionmaker()() as db:
        await _rebuild(db)
        rows = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalars().all()
        group = (await db.execute(select(GroupReport).where(GroupReport.session_id == SESSION_ID))).scalar_one()
        assert rows, "отчёты занятия не собрались"
        assert "report_comment" in model.calls and model.calls.count("report_group_insights") == 1
        assert all(row.ai_comment == GOOD_COMMENT and row.ai_comment_source == "local" for row in rows)
        assert group.group_insights == [GOOD_INSIGHT] and group.group_insights_source == "local"
        await db.rollback()


async def test_slow_model_falls_back_to_template_within_timeout(model: FakeModel, monkeypatch: pytest.MonkeyPatch, ai_env):
    """FR-019: ответ дольше таймаута не ждём — тексты шаблонные с пометкой, сборка не тормозит на всю задержку модели."""
    model.delay = 1.5
    monkeypatch.setattr(rat, "TEXT_TIMEOUT_SEC", 0.2)
    async with get_sessionmaker()() as db:
        started = time.monotonic()
        await _rebuild(db)
        elapsed = time.monotonic() - started
        rows = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalars().all()
        group = (await db.execute(select(GroupReport).where(GroupReport.session_id == SESSION_ID))).scalar_one()
        assert elapsed < 1.2, f"сборка ждала медленную модель: {elapsed:.2f} с"
        assert all(row.ai_comment_source == "template" and row.ai_comment.startswith("Разбор по правилам") for row in rows)
        assert group.group_insights_source == "template" and group.group_insights[0].startswith("Сводка по правилам")
        await db.rollback()


async def test_invalid_model_answer_falls_back_to_template(monkeypatch: pytest.MonkeyPatch, ai_env):
    fake = FakeModel(answer=False)
    monkeypatch.setattr(llm, "complete_json", fake)
    async with get_sessionmaker()() as db:
        await _rebuild(db)
        rows = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalars().all()
        assert rows and all(row.ai_comment_source == "template" for row in rows)
        assert all("ИИ" not in row.ai_comment for row in rows)
        await db.rollback()


async def test_stored_texts_are_not_regenerated_on_view(model: FakeModel, ai_env):
    async with get_sessionmaker()() as db:
        await _rebuild(db)
        calls_after_build = len(model.calls)
        response = await report_builder.get_reports(db, TEACHER, SESSION_ID, None)
        assert len(model.calls) == calls_after_build, "просмотр не должен вызывать модель"
        assert response["reports"] and all(r["aiCommentSource"] == "local" for r in response["reports"])
        assert response["groupReport"]["groupInsightsSource"] == "local"
        await db.rollback()


async def test_build_runs_inside_bound_llm_context(model: FakeModel, ai_env):
    """Сборка открывает контекст вызовов модели, а не использует глобальное состояние."""
    async with get_sessionmaker()() as db:
        await _rebuild(db)
        await db.rollback()
    assert model.contexts and all(item is not None for item in model.contexts)


def test_template_texts_have_no_ai_prefix():
    report = {"score": 80, "errors": [], "grammarErrors": [], "attempts": [{"attempt": {"primaryReactionMs": 10_000}, "norms": {"primaryReactionMs": 30_000}, "errors": [], "group": "Газ"}]}
    insights = build_insights({"id": SESSION_ID}, [report])
    assert insights[0].startswith("Сводка по правилам")
    assert all("ИИ" not in line for line in insights)
    scored = [{"attempt": {"primaryReactionMs": 10_000, "fullProcessingMs": 90_000}, "norms": {"primaryReactionMs": 30_000, "fullProcessingMs": 180_000}, "score": 80}]
    comment = report_builder._report_ai_comment(scored, [])
    assert comment.startswith("Разбор по правилам") and "ИИ" not in comment


async def test_no_attempts_session_does_not_call_model(model: FakeModel):
    """Без попыток нечего комментировать: модель не вызывается, тексты — шаблон «нет данных»."""
    assert await rat.attempt_comment(rat.attempt_facts([], []), "Нет данных") == rat.AiText("Нет данных", "template")
    assert (await rat.group_insights(rat.group_facts([]), ["Нет данных"])).source == "template"
    assert model.calls == []
