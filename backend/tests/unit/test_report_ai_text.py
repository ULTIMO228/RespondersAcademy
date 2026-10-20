"""Фича 006, T027: ИИ-тексты отчётов (`app.services.report_ai_text`).

Сеть не используется: `llm.complete_json` подменяется (`monkeypatch`), исходы строятся вручную.
"""

from __future__ import annotations

import time
from typing import Any

import pytest

from app.services import report_ai_text as rat
from ml.generate import llm

NAME = "Иванов Иван Иванович"
TEMPLATE = "Разбор по правилам: отработано карточек — 2."
GROUP_FACTS = {"students": 2, "averageScore": 80, "slowReaction": 1, "critical": 0, "errors": []}
GOOD = "Курсант уложился в нормативы и допустил одно некритичное замечание по эталону."


def _outcome(data: dict[str, Any] | None, source: str = "local", reason: str | None = None) -> llm.LlmOutcome:
    return llm.LlmOutcome(
        data=data,
        source=source,  # type: ignore[arg-type]
        provider={"local": "llamacpp:qwen", "cloud": llm.CLOUD_PROVIDER}.get(source),
        reason=reason,  # type: ignore[arg-type]
        purpose="report_comment",
        active_source="local",
        request_chars=10,
    )


class Spy:
    """Подмена `complete_json`: запоминает промпты и отдаёт заготовленный исход."""

    def __init__(self, outcome: llm.LlmOutcome, delay: float = 0.0) -> None:
        self.outcome, self.delay, self.calls = outcome, delay, []

    def __call__(self, purpose: str, system: str, user: str, schema: dict[str, Any], **kwargs: Any) -> llm.LlmOutcome:
        self.calls.append({"purpose": purpose, "system": system, "user": user, "schema": schema})
        if self.delay:
            time.sleep(self.delay)
        return self.outcome


def _scored(*, exceeded: bool = False, errors: list[dict[str, Any]] | None = None, score: int = 80) -> dict[str, Any]:
    return {
        "attempt": {"id": "att-1", "cardId": "c-001", "primaryReactionMs": 40_000 if exceeded else 10_000, "fullProcessingMs": 90_000},
        "norms": {"primaryReactionMs": 30_000, "fullProcessingMs": 180_000},
        "evaluation": {"errors": errors or [], "grammarErrors": []},
        "errors": errors or [],
        "score": score,
    }


# ─── Промпты: только агрегаты и формулировки правил ───────────────────────────────────────────────


def test_attempt_facts_have_no_people_or_ids():
    errors = [{"type": "noPrimaryStatus", "severity": "critical", "message": f"{NAME} не поставил статус — R1"}]
    facts = rat.attempt_facts([_scored(exceeded=True, errors=errors)], errors)
    system, user = rat.attempt_prompt(facts)
    blob = f"{system}\n{user}"
    assert NAME not in blob and "Иванов" not in blob
    assert "att-1" not in blob and "c-001" not in blob  # идентификаторы попыток и карточек не уходят
    assert "нет статуса реагирования" in blob  # формулировка правила, а не сырое сообщение с ФИО
    assert facts == {"attempts": 1, "exceededNorms": 1, "errors": [{"title": "нет статуса реагирования (памятка №1)", "count": 1}], "critical": 1, "score": 80}


def test_group_facts_aggregate_only():
    built = [
        {"report": {"student": {"fullName": NAME, "studentId": "u-001"}, "score": 70, "errors": [{"type": "noContact", "severity": "major"}], "grammarErrors": []}, "attempts": [_scored(exceeded=True)]},
        {"report": {"student": {"fullName": "Петрова Анна", "studentId": "u-002"}, "score": 90, "errors": [], "grammarErrors": []}, "attempts": [_scored()]},
    ]
    facts = rat.group_facts(built)
    system, user = rat.group_prompt(facts)
    blob = f"{system}\n{user}"
    for forbidden in (NAME, "Иванов", "Петрова", "u-001", "u-002"):
        assert forbidden not in blob
    assert facts["students"] == 2 and facts["averageScore"] == 80 and facts["slowReaction"] == 1
    assert facts["errors"] == [{"title": "не обеспечена оперативная связь (памятка №7)", "share": 50}]


def test_recommendation_prompt_has_no_student_id():
    facts = [{"key": "rec-abc", "kind": "category", "target": "Дерево", "errorTitle": "превышено время полной отработки", "count": 3}]
    system, user = rat.recommendation_prompt(facts)
    assert "u-006" not in user and "превышено время" in user and "rec-abc" in user


# ─── Валидация ответа ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text",
    [
        "Hello, the student did fine and met every norm today.",  # не русский
        "Коротко.",  # слишком короткий
        "Курсант справился. " * 60,  # слишком длинный
        "```json\n{\"text\": \"Курсант справился с заданием полностью\"}\n```",  # служебные фрагменты
        "Как языковая модель, system: курсант справился с заданием полностью.",
        "<think>рассуждение</think> Курсант справился с заданием полностью.",
        "Подробности: https://example.test/report курсант справился.",
        "- пункт один\n- пункт два про курсанта и его работу",  # разметка списка
    ],
)
def test_validate_rejects_bad_text(text):
    assert rat.validate_text(text, max_len=rat.COMMENT_MAX) is None


def test_validate_accepts_clean_russian_text():
    assert rat.validate_text(f"  {GOOD}  ", max_len=rat.COMMENT_MAX) == GOOD


# ─── Выбор источника и запасной путь ──────────────────────────────────────────────────────────────


async def test_comment_from_local_model(monkeypatch):
    spy = Spy(_outcome({"text": GOOD}))
    monkeypatch.setattr(llm, "complete_json", spy)
    result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE)
    assert (result.text, result.source) == (GOOD, "local")
    assert spy.calls[0]["purpose"] == "report_comment"


async def test_comment_from_cloud_source_is_marked_cloud(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome({"text": GOOD}, source="cloud")))
    result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE)
    assert (result.source, result.provider) == ("cloud", llm.CLOUD_PROVIDER)


@pytest.mark.parametrize("data", [{"text": "english only answer that is long enough to pass length"}, {"nope": 1}, {"text": 5}, None])
async def test_invalid_model_answer_falls_back_to_template(monkeypatch, data):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome(data)))
    result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE)
    assert (result.text, result.source) == (TEMPLATE, "template")


async def test_model_unavailable_gives_template(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome(None, source="template", reason="local_down")))
    result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE)
    assert (result.text, result.source) == (TEMPLATE, "template")


async def test_model_exception_gives_template(monkeypatch):
    def boom(*args: Any, **kwargs: Any) -> llm.LlmOutcome:
        raise RuntimeError("сеть")

    monkeypatch.setattr(llm, "complete_json", boom)
    result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE)
    assert result.source == "template"


async def test_no_attempts_makes_no_model_call(monkeypatch):
    spy = Spy(_outcome({"text": GOOD}))
    monkeypatch.setattr(llm, "complete_json", spy)
    result = await rat.attempt_comment(rat.attempt_facts([], []), rat.NO_DATA_TEXT)
    assert (result.text, result.source) == (rat.NO_DATA_TEXT, "template") and spy.calls == []


# ─── Таймаут (FR-019) ─────────────────────────────────────────────────────────────────────────────


def test_default_timeout_is_twenty_seconds():
    assert rat.TEXT_TIMEOUT_SEC == 20.0


async def test_slow_model_times_out_to_template_and_is_recorded(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome({"text": GOOD}), delay=1.0))
    ctx = llm.LlmCallContext(ai=None)
    started = time.monotonic()
    with llm.bind_context(ctx):
        result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE, timeout=0.05)
    assert time.monotonic() - started < 0.8, "ожидание не должно ждать зависший поток"
    assert (result.text, result.source) == (TEMPLATE, "template")
    assert [o.reason for o in ctx.outcomes if o.source == "template"] == ["timeout"]  # попадёт в ai_health


async def test_cloud_timeout_preserves_prior_reservation(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome({"text": GOOD}), delay=0.2))
    ctx = llm.LlmCallContext(ai=type("CloudSettings", (), {"source": "cloud"})(), cloud_reservations=1)

    with llm.bind_context(ctx):
        result = await rat.attempt_comment(rat.attempt_facts([_scored()], []), TEMPLATE, timeout=0.01)

    timeout_outcome = next(o for o in ctx.outcomes if o.reason == "timeout")
    assert (result.text, result.source) == (TEMPLATE, "template")
    assert timeout_outcome.cloud_reserved is True and timeout_outcome.cloud_sent is False


# ─── Инсайты группы и рекомендации ────────────────────────────────────────────────────────────────


async def test_group_insights_list_validated(monkeypatch):
    items = ["Половина группы превысила норматив первичной реакции.", "Чаще всего не обеспечена оперативная связь."]
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome({"items": items})))
    result = await rat.group_insights(GROUP_FACTS, ["шаблон"])
    assert (result.items, result.source) == (items, "local")


@pytest.mark.parametrize("items", [[], ["short"], ["Нормальная фраза про группу занятия.", "english sentence that is long enough"], "строка", ["Фраза про группу занятия."] * 9])
async def test_group_insights_bad_list_falls_back(monkeypatch, items):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome({"items": items})))
    result = await rat.group_insights(GROUP_FACTS, ["шаблон"])
    assert (result.items, result.source) == (["шаблон"], "template")


async def test_recommendation_texts_per_key(monkeypatch):
    answer = {"items": [{"key": "rec-1", "text": "Повторите работу со статусами реагирования."}, {"key": "rec-x", "text": "Лишний ключ без рекомендации здесь."}, {"key": "rec-2", "text": "bad"}]}
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome(answer)))
    facts = [{"key": "rec-1", "kind": "category", "target": "A", "errorTitle": "x", "count": 1}, {"key": "rec-2", "kind": "card", "target": "B", "errorTitle": "y", "count": 2}]
    result = await rat.recommendation_texts(facts)
    assert result["rec-1"].source == "local" and result["rec-1"].text.startswith("Повторите")
    assert result["rec-2"].source == "template" and result["rec-2"].text is None
    assert "rec-x" not in result


async def test_recommendation_texts_model_down(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", Spy(_outcome(None, source="template", reason="local_down")))
    result = await rat.recommendation_texts([{"key": "rec-1", "kind": "category", "target": "A", "errorTitle": "x", "count": 1}])
    assert result["rec-1"].source == "template" and result["rec-1"].text is None
    assert await rat.recommendation_texts([]) == {}
