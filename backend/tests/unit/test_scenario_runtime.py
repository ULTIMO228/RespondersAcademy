"""Детерминированный движок сценариев 112: маршруты, события, защита от циклов и битых графов."""

from __future__ import annotations

import ast
import copy
from pathlib import Path
from typing import Any

import pytest

from app.scenario_runtime import (
    Graph,
    InvalidActionError,
    InvalidChoiceError,
    InvalidGraphError,
    LoopLimitError,
    RunFinishedError,
    ScenarioEngine,
    ScenarioRun,
)


def diamond() -> dict[str, Any]:
    """capture → условие urgency (urgent / routine / иначе other) → notify → end."""
    return {
        "schemaVersion": "scenario-graph/1",
        "start": "capture",
        "nodes": [
            {"id": "capture", "type": "action", "action": "captureCaller", "next": "route"},
            {
                "id": "route",
                "type": "condition",
                "branches": [
                    {"name": "urgent", "when": {"fact": "urgency", "op": "eq", "value": "high"}, "next": "notify"},
                    {
                        "name": "routine",
                        "when": {"all": [{"fact": "urgency", "op": "eq", "value": "low"}, {"fact": "victims", "op": "eq", "value": 0}]},
                        "next": "classify",
                    },
                ],
                "else": {"name": "other", "next": "classify"},
            },
            {"id": "notify", "type": "action", "action": "notify:103", "next": "classify"},
            {"id": "classify", "type": "action", "action": "classify", "next": "done"},
            {"id": "done", "type": "end", "outcome": "completed"},
        ],
    }


def run_route(facts: dict[str, Any], actions: list[str]) -> ScenarioRun:
    engine = ScenarioEngine(Graph.parse(diamond()))
    run = engine.start(facts)
    for action in actions:
        engine.perform(run, action)
    return run


def visited(run: ScenarioRun) -> list[str]:
    return [event.node for event in run.events if event.kind in ("started", "action")]


@pytest.mark.parametrize(
    ("facts", "actions", "branch", "path"),
    [
        ({"urgency": "high"}, ["captureCaller", "notify:103", "classify"], "urgent", ["capture", "capture", "notify", "classify"]),
        ({"urgency": "low", "victims": 0}, ["captureCaller", "classify"], "routine", ["capture", "capture", "classify"]),
        ({"urgency": "low", "victims": 2}, ["captureCaller", "classify"], "other", ["capture", "capture", "classify"]),
        ({}, ["captureCaller", "classify"], "other", ["capture", "capture", "classify"]),
    ],
)
def test_маршруты_выбирают_именованную_ветку_по_фактам(facts, actions, branch, path) -> None:
    run = run_route(facts, actions)
    assert run.status == "completed" and run.outcome == "completed"
    assert [event.data["branch"] for event in run.events if event.kind == "branch"] == [branch]
    assert visited(run)[: len(path)] == path[: len(visited(run))]
    assert [event.kind for event in run.events][0] == "started"
    assert [event.kind for event in run.events][-1] == "ended"


def test_старт_ждёт_первого_действия_и_события_нумеруются_подряд() -> None:
    engine = ScenarioEngine(Graph.parse(diamond()))
    run = engine.start({"urgency": "high"})
    assert run.status == "waiting" and run.current == "capture"
    assert engine.expected_actions(run) == ["captureCaller"]
    engine.perform(run, "captureCaller")
    assert run.current == "notify"
    assert [event.seq for event in run.events] == list(range(len(run.events)))
    assert [event.kind for event in run.events] == ["started", "action", "branch"]


def test_неожиданное_действие_отклоняется_без_изменения_состояния_а_верное_проходит() -> None:
    engine = ScenarioEngine(Graph.parse(diamond()))
    run = engine.start({})
    before = copy.deepcopy(run.to_dict())
    with pytest.raises(InvalidActionError):
        engine.perform(run, "classify")
    assert run.to_dict() == before
    engine.perform(run, "captureCaller")
    assert run.current == "classify"


def with_urgency_input() -> dict[str, Any]:
    data = copy.deepcopy(diamond())
    next(n for n in data["nodes"] if n["id"] == "capture")["input"] = {
        "fact": "urgency",
        "options": [{"value": "high", "label": "Срочно"}, {"value": "low", "label": "Не срочно"}],
    }
    return data


def test_выбор_задаёт_факт_для_следующего_условия_и_только_из_вариантов() -> None:
    engine = ScenarioEngine(Graph.parse(with_urgency_input()))
    run = engine.start({})
    with pytest.raises(InvalidChoiceError):
        engine.perform(run, "captureCaller", choice={"nested": 1})
    with pytest.raises(InvalidChoiceError):
        engine.perform(run, "captureCaller")
    assert run.current == "capture"
    engine.perform(run, "captureCaller", choice="high")
    assert run.current == "notify" and run.facts["urgency"] == "high"
    with pytest.raises(InvalidChoiceError):
        engine.perform(run, "notify:103", choice="x")  # у шага нет вариантов


def test_завершённый_прогон_не_принимает_действий_а_ручное_завершение_работает_один_раз() -> None:
    engine = ScenarioEngine(Graph.parse(diamond()))
    done = run_route({"urgency": "high"}, ["captureCaller", "notify:103", "classify"])
    with pytest.raises(RunFinishedError):
        engine.perform(done, "classify")
    with pytest.raises(RunFinishedError):
        engine.finish(done)

    run = engine.start({})
    engine.finish(run, outcome="teacherStopped")
    assert run.status == "aborted" and run.outcome == "teacherStopped"
    assert run.events[-1].kind == "ended" and run.events[-1].data == {"outcome": "teacherStopped", "by": "manual"}
    with pytest.raises(RunFinishedError):
        engine.perform(run, "captureCaller")


def test_движок_детерминирован_и_прогон_восстанавливается_из_снимка() -> None:
    first = run_route({"urgency": "high"}, ["captureCaller", "notify:103", "classify"])
    second = run_route({"urgency": "high"}, ["captureCaller", "notify:103", "classify"])
    assert first.to_dict() == second.to_dict()

    engine = ScenarioEngine(Graph.parse(diamond()))
    run = engine.start({"urgency": "high"})
    engine.perform(run, "captureCaller")
    restored = ScenarioRun.from_dict(engine.graph, run.to_dict())
    engine.perform(restored, "notify:103")
    engine.perform(restored, "classify")
    assert restored.to_dict() == first.to_dict()


def retry_graph(max_visits: int | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": "ask", "type": "action", "action": "askAgain", "next": "check",
        "input": {"fact": "ready", "options": [{"value": True, "label": "Да"}, {"value": False, "label": "Нет"}]},
    }
    if max_visits is not None:
        node["maxVisits"] = max_visits
    return {
        "schemaVersion": "scenario-graph/1",
        "start": "ask",
        "nodes": [
            node,
            {
                "id": "check",
                "type": "condition",
                "branches": [{"name": "ready", "when": {"fact": "ready", "op": "eq", "value": True}, "next": "done"}],
                "else": {"name": "retry", "next": "ask"},
            },
            {"id": "done", "type": "end", "outcome": "completed"},
        ],
    }


def test_цикл_через_действие_допустим_но_ограничен_числом_посещений() -> None:
    engine = ScenarioEngine(Graph.parse(retry_graph(max_visits=3)))
    ok = engine.start({})
    engine.perform(ok, "askAgain", choice=False)
    engine.perform(ok, "askAgain", choice=True)
    assert ok.status == "completed"

    run = engine.start({})
    with pytest.raises(LoopLimitError):
        for _ in range(10):
            engine.perform(run, "askAgain", choice=False)
    assert run.status == "faulted"
    assert run.events[-1].kind == "faulted" and run.events[-1].data["node"] == "ask"
    with pytest.raises(RunFinishedError):
        engine.perform(run, "askAgain", choice=False)


def test_общий_лимит_шагов_останавливает_прогон() -> None:
    engine = ScenarioEngine(Graph.parse(retry_graph(max_visits=1000)), max_steps=5)
    run = engine.start({})
    with pytest.raises(LoopLimitError):
        for _ in range(100):
            engine.perform(run, "askAgain", choice=False)
    assert run.status == "faulted" and run.events[-1].data["reason"] == "maxSteps"


def mutate(change) -> dict[str, Any]:
    data = copy.deepcopy(diamond())
    change(data)
    return data


def node(data: dict[str, Any], node_id: str) -> dict[str, Any]:
    return next(item for item in data["nodes"] if item["id"] == node_id)


@pytest.mark.parametrize(
    ("change", "fragment"),
    [
        (lambda d: d.update(schemaVersion="x/1"), "schemaVersion"),
        (lambda d: d.update(start="nowhere"), "start"),
        (lambda d: d["nodes"].append({"id": "capture", "type": "end", "outcome": "x"}), "дублир"),
        (lambda d: node(d, "capture").update(next="ghost"), "ghost"),
        (lambda d: node(d, "route").pop("else"), "else"),
        (lambda d: node(d, "route")["branches"][1].update(name="urgent"), "имя ветки"),
        (lambda d: node(d, "route")["branches"][0]["when"].update(op="regex"), "regex"),
        (lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": "eq"}), "value"),
        (lambda d: node(d, "done").update(outcome=""), "outcome"),
        (lambda d: node(d, "capture").update(type="magic"), "magic"),
        (lambda d: d["nodes"].append({"id": "orphan", "type": "end", "outcome": "x"}), "orphan"),
        (lambda d: node(d, "classify").update(next="classify"), "завершени"),
        (lambda d: node(d, "capture").update(maxVisits=0), "maxVisits"),
    ],
)
def test_некорректный_граф_отклоняется_со_списком_ошибок(change, fragment) -> None:
    Graph.parse(diamond())
    with pytest.raises(InvalidGraphError) as caught:
        Graph.parse(mutate(change))
    assert any(fragment in error for error in caught.value.errors), caught.value.errors


def test_цикл_только_из_условий_отклоняется_при_разборе() -> None:
    data = {
        "schemaVersion": "scenario-graph/1",
        "start": "a",
        "nodes": [
            {"id": "a", "type": "condition", "branches": [{"name": "x", "when": {"fact": "f", "op": "exists"}, "next": "b"}], "else": {"name": "e", "next": "done"}},
            {"id": "b", "type": "condition", "branches": [{"name": "y", "when": {"fact": "g", "op": "exists"}, "next": "a"}], "else": {"name": "e", "next": "done"}},
            {"id": "done", "type": "end", "outcome": "completed"},
        ],
    }
    with pytest.raises(InvalidGraphError) as caught:
        Graph.parse(data)
    assert any("цикл" in error for error in caught.value.errors)


def test_слишком_большой_граф_и_глубокое_условие_отклоняются() -> None:
    nodes = [{"id": f"n{i}", "type": "action", "action": "a", "next": f"n{i + 1}"} for i in range(600)]
    nodes.append({"id": "n600", "type": "end", "outcome": "completed"})
    with pytest.raises(InvalidGraphError):
        Graph.parse({"schemaVersion": "scenario-graph/1", "start": "n0", "nodes": nodes})
    deep: dict[str, Any] = {"fact": "x", "op": "exists"}
    for _ in range(12):
        deep = {"not": deep}
    with pytest.raises(InvalidGraphError):
        Graph.parse(mutate(lambda d: node(d, "route")["branches"][0].update(when=deep)))


def test_переходы_не_зависят_от_ии_и_ui() -> None:
    package = Path(__file__).resolve().parents[2] / "app" / "scenario_runtime"
    forbidden = ("ai_gateway", "ml", "fastapi", "sqlalchemy", "random", "time", "datetime")
    for path in package.glob("*.py"):
        for item in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names: list[str] = []
            if isinstance(item, ast.Import):
                names = [alias.name for alias in item.names]
            elif isinstance(item, ast.ImportFrom) and item.module:
                names = [item.module]
            for name in names:
                parts = name.split(".")
                assert not set(parts) & set(forbidden), f"{path.name} импортирует {name}"


@pytest.mark.parametrize(
    ("change", "fragment"),
    [
        (lambda d: d.update(extra=1), "extra"),
        (lambda d: node(d, "capture").update(branches=[]), "branches"),
        (lambda d: node(d, "route").update(next="done"), "next"),
        (lambda d: node(d, "done").update(action="x"), "action"),
        (lambda d: node(d, "route").update(els={"name": "x", "next": "done"}), "els"),
        (lambda d: node(d, "route")["branches"][0].update(nxt="done"), "nxt"),
        (lambda d: node(d, "route")["else"].update(extra=1), "extra"),
        (lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": "eq", "value": {"a": 1}}), "скаляр"),
        (lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": "in", "value": [[1]]}), "скаляр"),
        (lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": "gt", "value": [1]}), "скаляр"),
    ],
)
def test_неизвестные_ключи_и_нескалярные_значения_отклоняются(change, fragment) -> None:
    with pytest.raises(InvalidGraphError) as caught:
        Graph.parse(mutate(change))
    assert any(fragment in error for error in caught.value.errors), caught.value.errors


def test_ветки_условия_ограничены_по_числу_и_сработавшая_первой_побеждает() -> None:
    many = [{"name": f"b{i}", "when": {"fact": "x", "op": "exists"}, "next": "notify" if i == 0 else "done"} for i in range(60)]
    with pytest.raises(InvalidGraphError) as caught:
        Graph.parse(mutate(lambda d: node(d, "route").update(branches=many)))
    assert all("веток" in error for error in caught.value.errors), caught.value.errors
    engine = ScenarioEngine(Graph.parse(diamond()))
    run = engine.start({"urgency": "high", "victims": 0})
    assert [e.data["branch"] for e in run.events if e.kind == "branch"] == []  # старт ждёт captureCaller
    engine.perform(run, "captureCaller")
    assert [e.data["branch"] for e in run.events if e.kind == "branch"] == ["urgent"]


def test_старт_сразу_в_end_завершает_прогон_и_факты_нескалярного_типа_не_принимаются() -> None:
    graph = Graph.parse({"schemaVersion": "scenario-graph/1", "start": "done", "nodes": [{"id": "done", "type": "end", "outcome": "completed"}]})
    run = ScenarioEngine(graph).start({})
    assert run.status == "completed" and [e.kind for e in run.events] == ["started", "ended"]
    with pytest.raises(ValueError):
        ScenarioEngine(graph).start({"x": [1]})
    with pytest.raises(ValueError):
        ScenarioEngine(graph).start({"x": float("nan")})


@pytest.mark.parametrize("start", [[], {}, ["a"], 5, None, True])
def test_start_нестрокового_типа_отклоняется_как_граф_а_не_падает(start) -> None:
    with pytest.raises(InvalidGraphError):
        Graph.parse({**diamond(), "start": start})


@pytest.mark.parametrize(
    ("fact", "op", "value", "expected"),
    [
        (True, "gt", 0, False),  # bool — не число
        ("3", "gt", 2, False),  # строка и число не сравниваются
        (3, "gt", 2, True),
        (2.5, "ge", 2, True),
        (1, "lt", 1.5, True),
        (True, "eq", 1, False),
    ],
)
def test_сравнения_порядка_только_для_чисел(fact, op, value, expected) -> None:
    graph = Graph.parse(mutate(lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": op, "value": value})))
    engine = ScenarioEngine(graph)
    run = engine.start({"x": fact})
    engine.perform(run, "captureCaller")
    chose = [e.data["branch"] for e in run.events if e.kind == "branch"][0]
    assert (chose == "urgent") is expected


def test_факты_заданные_при_старте_нельзя_перезаписать_выбором_и_защита_переживает_снимок() -> None:
    engine = ScenarioEngine(Graph.parse(with_urgency_input()))
    run = engine.start({"urgency": "high"})
    before = copy.deepcopy(run.to_dict())
    with pytest.raises(InvalidChoiceError, match="urgency"):
        engine.perform(run, "captureCaller", choice="low")
    assert run.to_dict() == before
    restored = ScenarioRun.from_dict(engine.graph, run.to_dict())
    with pytest.raises(InvalidChoiceError):
        engine.perform(restored, "captureCaller", choice="low")



@pytest.mark.parametrize("value", ["a", True, None, [1]])
def test_порядковые_операции_требуют_числовое_значение(value) -> None:
    with pytest.raises(InvalidGraphError):
        Graph.parse(mutate(lambda d: node(d, "route")["branches"][0].update(when={"fact": "x", "op": "gt", "value": value})))
