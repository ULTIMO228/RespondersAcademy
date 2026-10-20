"""Подсчёт результата прохождения графа: детерминированная формула из spec 005 §4."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from app.scenario_runtime import Graph, ScenarioEngine
from app.scenario_runtime.engine import InvalidActionError
from app.scenario_runtime.scoring import compute_result


def graph_data(*, pass_score: int = 60, wrong: int = 5) -> dict[str, Any]:
    return {
        "schemaVersion": "scenario-graph/1",
        "start": "n1",
        "nodes": [
            {"id": "n1", "type": "action", "action": "ask", "label": "Спросить", "next": "n2",
             "input": {"fact": "k", "options": [{"value": "good", "label": "Верно"}, {"value": "bad", "label": "Неверно", "penalty": 30}]}},
            {"id": "n2", "type": "condition", "branches": [{"name": "Хорошо", "when": {"fact": "k", "op": "eq", "value": "good"}, "next": "ok"}],
             "else": {"name": "Плохо", "next": "no"}},
            {"id": "ok", "type": "end", "title": "Успех", "outcome": "completed", "score": 100, "passed": True},
            {"id": "no", "type": "end", "outcome": "failed", "score": 50, "passed": True},
        ],
        "scoring": {"wrongActionPenalty": wrong, "passScore": pass_score},
    }


def play(data: dict[str, Any], choice: str, wrong_attempts: int = 0):
    engine = ScenarioEngine(Graph.parse(data))
    run = engine.start({})
    for _ in range(wrong_attempts):
        with pytest.raises(InvalidActionError):
            engine.perform(run, "nope")
        engine.reject(run, "nope")
    engine.perform(run, "ask", choice=choice)
    return engine.graph, run


def test_чистое_прохождение_даёт_максимум_и_зачёт() -> None:
    graph, run = play(graph_data(), "good")
    assert compute_result(graph, run) == {
        "score": 100, "passed": True, "outcome": "completed", "outcomeTitle": "Успех", "wrongAttempts": 0,
        "steps": run.steps, "path": ["n1", "n2", "ok"], "branches": ["Хорошо"],
    }


def test_штрафы_неверных_действий_и_вариантов_вычитаются_и_ограничиваются_нулём() -> None:
    graph, run = play(graph_data(), "good", wrong_attempts=3)
    assert compute_result(graph, run)["score"] == 85 and compute_result(graph, run)["wrongAttempts"] == 3
    graph, run = play(graph_data(), "bad", wrong_attempts=2)  # 50 − 2·5 − 30
    assert compute_result(graph, run)["score"] == 10 and compute_result(graph, run)["passed"] is False
    graph, run = play(graph_data(wrong=50), "bad", wrong_attempts=2)
    assert compute_result(graph, run)["score"] == 0  # не ниже нуля


@pytest.mark.parametrize(("pass_score", "expected"), [(90, True), (91, False), (0, True)])
def test_порог_зачёта_включает_границу(pass_score: int, expected: bool) -> None:
    graph, run = play(graph_data(pass_score=pass_score), "good", wrong_attempts=2)  # 100 − 10 = 90
    assert compute_result(graph, run)["score"] == 90 and compute_result(graph, run)["passed"] is expected


def test_завершение_с_passed_false_не_засчитывается_при_любом_балле() -> None:
    data = copy.deepcopy(graph_data())
    next(n for n in data["nodes"] if n["id"] == "no")["passed"] = False
    graph, run = play(data, "bad")  # 50 − 30 = 20 при пороге 60
    assert compute_result(graph, run)["passed"] is False
    data["scoring"]["passScore"] = 0
    graph, run = play(data, "bad")
    assert compute_result(graph, run)["score"] == 20 and compute_result(graph, run)["passed"] is False  # end.passed=false главнее


def test_прерванный_и_ожидающий_прогон_получает_ноль_и_не_засчитывается() -> None:
    engine = ScenarioEngine(Graph.parse(graph_data()))
    run = engine.start({})
    engine.finish(run, outcome="abandoned")
    result = compute_result(engine.graph, run)
    assert result["score"] == 0 and result["passed"] is False and result["outcome"] == "abandoned"
    assert result["outcomeTitle"] == "abandoned" and result["path"] == ["n1"]


def test_отклонённое_действие_не_двигает_прогон_и_только_пишет_событие() -> None:
    engine = ScenarioEngine(Graph.parse(graph_data()))
    run = engine.start({})
    steps, current = run.steps, run.current
    engine.reject(run, "nope")
    assert (run.steps, run.current, run.status) == (steps, current, "waiting")
    assert run.events[-1].kind == "rejected" and run.events[-1].data == {"action": "nope"}
    assert [e.seq for e in run.events] == list(range(len(run.events)))
    engine.finish(run)
    with pytest.raises(Exception):  # noqa: B017 - завершённый прогон отклонения не принимает
        engine.reject(run, "nope")
