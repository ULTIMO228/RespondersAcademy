"""Расширенный формат scenario-graph/1: подписи, шаги с эффектами и выбором, оценка, раскладка."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from app.scenario_runtime import Graph, InvalidGraphError, ScenarioEngine
from app.scenario_runtime.engine import InvalidChoiceError


def rich() -> dict[str, Any]:
    return {
        "schemaVersion": "scenario-graph/1",
        "start": "n1",
        "nodes": [
            {"id": "n1", "type": "action", "title": "Приём вызова", "prompt": "Заявитель сообщает о дереве.",
             "action": "captureCaller", "label": "Записать данные заявителя", "sets": {"callerKnown": True}, "next": "n2"},
            {"id": "n2", "type": "action", "title": "Тип", "action": "classify", "label": "Определить тип",
             "input": {"fact": "category", "options": [
                 {"value": "tree", "label": "Падение дерева"},
                 {"value": "fire", "label": "Пожар", "penalty": 20}]},
             "next": "n3"},
            {"id": "n3", "type": "condition", "title": "Тип происшествия",
             "branches": [{"name": "Дерево", "when": {"fact": "category", "op": "eq", "value": "tree"}, "next": "n4"}],
             "else": {"name": "Иначе", "next": "n5"}},
            {"id": "n4", "type": "end", "title": "Успех", "outcome": "completed", "score": 100, "passed": True},
            {"id": "n5", "type": "end", "outcome": "wrongCategory", "score": 40, "passed": False},
        ],
        "decoys": [{"action": "callPolice", "label": "Вызвать полицию"}],
        "scoring": {"wrongActionPenalty": 5, "passScore": 60},
        "layout": {"n1": {"x": 80, "y": 60}, "n2": {"x": 80.5, "y": 200}},
    }


def test_полный_пример_разбирается_и_даёт_каталог_действий() -> None:
    graph = Graph.parse(rich())
    assert graph.nodes["n1"].title == "Приём вызова" and graph.nodes["n1"].sets == {"callerKnown": True}
    assert [o.value for o in graph.nodes["n2"].options] == ["tree", "fire"] and graph.nodes["n2"].options[1].penalty == 20
    assert graph.nodes["n4"].score == 100 and graph.nodes["n5"].passed is False
    assert graph.scoring == {"wrongActionPenalty": 5, "passScore": 60}
    assert graph.layout["n2"] == {"x": 80.5, "y": 200}
    assert graph.action_catalog() == [
        {"action": "classify", "label": "Определить тип"},
        {"action": "callPolice", "label": "Вызвать полицию"},
        {"action": "captureCaller", "label": "Записать данные заявителя"},
    ] or sorted(c["label"] for c in graph.action_catalog()) == ["Вызвать полицию", "Записать данные заявителя", "Определить тип"]


def test_значения_по_умолчанию_у_графа_без_расширений() -> None:
    graph = Graph.parse({"schemaVersion": "scenario-graph/1", "start": "e", "nodes": [{"id": "e", "type": "end", "outcome": "completed"}]})
    assert graph.scoring == {"wrongActionPenalty": 5, "passScore": 60} and graph.layout == {} and graph.nodes["e"].score == 100


def mutated(change) -> dict[str, Any]:
    data = copy.deepcopy(rich())
    change(data)
    return data


def node(data: dict[str, Any], node_id: str) -> dict[str, Any]:
    return next(item for item in data["nodes"] if item["id"] == node_id)


@pytest.mark.parametrize(
    ("change", "fragment"),
    [
        (lambda d: node(d, "n1").update(title=""), "title"),
        (lambda d: node(d, "n1").update(title="x" * 161), "title"),
        (lambda d: node(d, "n1").update(prompt="x" * 1001), "prompt"),
        (lambda d: node(d, "n1").update(label=5), "label"),
        (lambda d: node(d, "n3").update(prompt="нет"), "prompt"),
        (lambda d: node(d, "n1").update(sets={"x": {"a": 1}}), "sets"),
        (lambda d: node(d, "n1").update(sets={f"k{i}": i for i in range(17)}), "sets"),
        (lambda d: node(d, "n2")["input"].update(options=[{"value": "a", "label": "A"}]), "вариант"),
        (lambda d: node(d, "n2")["input"].update(options=[{"value": "a", "label": "A"}, {"value": "a", "label": "B"}]), "повтор"),
        (lambda d: node(d, "n2")["input"]["options"][0].update(penalty=101), "penalty"),
        (lambda d: node(d, "n2")["input"]["options"][0].update(label=""), "label"),
        (lambda d: node(d, "n2")["input"]["options"][0].update(value=None), "value"),
        (lambda d: node(d, "n2")["input"].update(extra=1), "extra"),
        (lambda d: node(d, "n2").update(input={"fact": "", "options": []}), "input"),
        (lambda d: node(d, "n4").update(score=101), "score"),
        (lambda d: node(d, "n4").update(passed="yes"), "passed"),
        (lambda d: d["scoring"].update(wrongActionPenalty=51), "wrongActionPenalty"),
        (lambda d: d["scoring"].update(passScore=-1), "passScore"),
        (lambda d: d["scoring"].update(extra=1), "extra"),
        (lambda d: d["decoys"].append({"action": "captureCaller", "label": "дубль"}), "decoys"),
        (lambda d: d["decoys"].append({"action": "callPolice", "label": "ещё"}), "decoys"),
        (lambda d: d.update(decoys=[{"action": f"a{i}", "label": "x"} for i in range(21)]), "decoys"),
        (lambda d: d["layout"].update(ghost={"x": 1, "y": 2}), "layout"),
        (lambda d: d["layout"].update(n1={"x": 1e9, "y": 0}), "layout"),
        (lambda d: d["layout"].update(n1={"x": float("nan"), "y": 0}), "layout"),
        (lambda d: d["layout"].update(n1={"x": 1}), "layout"),
    ],
)
def test_некорректные_расширения_отклоняются(change, fragment) -> None:
    with pytest.raises(InvalidGraphError) as caught:
        Graph.parse(mutated(change))
    assert any(fragment in error for error in caught.value.errors), caught.value.errors


def test_sets_применяются_автоматически_а_выбор_задаёт_факт_и_штраф() -> None:
    engine = ScenarioEngine(Graph.parse(rich()))
    run = engine.start({})
    engine.perform(run, "captureCaller")
    assert run.facts["callerKnown"] is True
    engine.perform(run, "classify", choice="tree")
    assert run.status == "completed" and run.outcome == "completed" and run.facts["category"] == "tree"
    assert [e.data.get("choice") for e in run.events if e.kind == "action"] == [None, "tree"]

    other = engine.start({})
    engine.perform(other, "captureCaller")
    engine.perform(other, "classify", choice="fire")
    assert other.outcome == "wrongCategory"
    assert [e.data["penalty"] for e in other.events if e.kind == "action"] == [0, 20]


def test_выбор_обязателен_только_из_объявленных_вариантов() -> None:
    engine = ScenarioEngine(Graph.parse(rich()))
    run = engine.start({})
    engine.perform(run, "captureCaller")
    before = copy.deepcopy(run.to_dict())
    for bad in (None, "unknown", 1, True):
        with pytest.raises(InvalidChoiceError):
            engine.perform(run, "classify", choice=bad)
    assert run.to_dict() == before
    with pytest.raises(InvalidChoiceError):
        engine.perform(engine.start({}), "captureCaller", choice="tree")  # у шага нет input
    engine.perform(run, "classify", choice="tree")
    assert run.status == "completed"


def test_выбор_не_может_перезаписать_заблокированный_факт_карточки() -> None:
    engine = ScenarioEngine(Graph.parse(rich()))
    run = engine.start({"category": "fire"})
    engine.perform(run, "captureCaller")
    with pytest.raises(InvalidChoiceError):
        engine.perform(run, "classify", choice="tree")
    assert run.status == "waiting"
