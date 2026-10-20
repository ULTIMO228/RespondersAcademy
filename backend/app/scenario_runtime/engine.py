"""Детерминированное выполнение графа сценария: старт, действия, ветки, события, завершение.

Движок не знает про UI редактора, БД и ИИ: он работает над `Graph` и сериализуемым `ScenarioRun`.
Переходом по условию управляют только факты прогона; время и случайность в модуле не используются —
метки времени добавляет вызывающий код.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any

from app.scenario_runtime.graph import Graph, Node, evaluate

DEFAULT_MAX_STEPS = 200
MAX_FACTS = 64
Scalar = (str, int, float, bool, type(None))


class EngineError(Exception):
    """Базовая ошибка выполнения."""


class InvalidActionError(EngineError):
    def __init__(self, action: str, expected: list[str]) -> None:
        super().__init__(f"Действие «{action}» не ожидается; ожидается: {', '.join(expected) or 'ничего'}")
        self.expected = expected


class RunFinishedError(EngineError):
    """Прогон уже завершён, прерван или остановлен защитой."""


class LoopLimitError(EngineError):
    """Превышен лимит шагов или посещений узла; прогон помечен `faulted`."""


@dataclass(frozen=True)
class Event:
    seq: int
    kind: str  # started | action | branch | ended | faulted
    node: str | None
    data: dict[str, Any]


@dataclass
class ScenarioRun:
    current: str
    facts: dict[str, Any]
    status: str = "waiting"  # waiting | completed | aborted | faulted
    outcome: str | None = None
    steps: int = 0
    visits: dict[str, int] = field(default_factory=dict)
    events: list[Event] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return copy.deepcopy(
            {
                "current": self.current,
                "facts": self.facts,
                "status": self.status,
                "outcome": self.outcome,
                "steps": self.steps,
                "visits": self.visits,
                "events": [
                    {"seq": item.seq, "kind": item.kind, "node": item.node, "data": item.data}
                    for item in self.events
                ],
            }
        )

    @classmethod
    def from_dict(cls, graph: Graph, data: dict[str, Any]) -> ScenarioRun:
        if data["current"] not in graph.nodes:
            raise EngineError(f"Снимок ссылается на неизвестный узел «{data['current']}»")
        snapshot = copy.deepcopy(data)
        return cls(
            current=snapshot["current"],
            facts=snapshot["facts"],
            status=snapshot["status"],
            outcome=snapshot["outcome"],
            steps=snapshot["steps"],
            visits=snapshot["visits"],
            events=[Event(**item) for item in snapshot["events"]],
        )


def _checked_facts(facts: dict[Any, Any] | None) -> dict[str, Any]:
    result = dict(facts or {})
    if len(result) > MAX_FACTS:
        raise ValueError(f"Фактов больше {MAX_FACTS}")
    for key, value in result.items():
        if not isinstance(key, str) or not key:
            raise ValueError("Имя факта должно быть непустой строкой")
        if not isinstance(value, Scalar) or (isinstance(value, float) and not math.isfinite(value)):
            raise ValueError(f"Факт «{key}» должен быть строкой, конечным числом, булевым значением или null")
    return result


class ScenarioEngine:
    def __init__(self, graph: Graph, *, max_steps: int = DEFAULT_MAX_STEPS) -> None:
        self.graph = graph
        self.max_steps = max_steps

    def start(self, facts: dict[str, Any] | None = None) -> ScenarioRun:
        run = ScenarioRun(current=self.graph.start, facts=_checked_facts(facts))
        self._record(run, "started", self.graph.start, {"facts": dict(run.facts)})
        self._enter(run, self.graph.start)
        self._advance(run)
        return run

    def expected_actions(self, run: ScenarioRun) -> list[str]:
        node = self.graph.nodes[run.current]
        return [node.action] if run.status == "waiting" and node.type == "action" and node.action else []

    def perform(self, run: ScenarioRun, action: str, set_facts: dict[str, Any] | None = None) -> None:
        self._require_waiting(run)
        expected = self.expected_actions(run)
        if action not in expected:
            raise InvalidActionError(action, expected)
        updates = _checked_facts(set_facts)
        if len(run.facts.keys() | updates.keys()) > MAX_FACTS:
            raise ValueError(f"Фактов больше {MAX_FACTS}")
        node = self.graph.nodes[run.current]
        run.facts.update(updates)
        self._record(run, "action", node.id, {"action": action, "set": updates})
        self._enter(run, str(node.next))
        self._advance(run)

    def finish(self, run: ScenarioRun, outcome: str = "aborted") -> None:
        self._require_waiting(run)
        run.status, run.outcome = "aborted", outcome
        self._record(run, "ended", run.current, {"outcome": outcome, "by": "manual"})

    def _require_waiting(self, run: ScenarioRun) -> None:
        if run.status != "waiting":
            raise RunFinishedError(f"Прогон не принимает действий: статус «{run.status}»")

    def _record(self, run: ScenarioRun, kind: str, node: str | None, data: dict[str, Any]) -> None:
        run.events.append(Event(seq=len(run.events), kind=kind, node=node, data=copy.deepcopy(data)))

    def _fault(self, run: ScenarioRun, node: Node, reason: str) -> None:
        run.status, run.outcome = "faulted", "faulted"
        self._record(run, "faulted", node.id, {"reason": reason, "node": node.id, "steps": run.steps})
        raise LoopLimitError(f"Прогон остановлен защитой от циклов ({reason}) на узле «{node.id}»")

    def _enter(self, run: ScenarioRun, node_id: str) -> None:
        node = self.graph.nodes[node_id]
        run.current = node_id
        run.steps += 1
        run.visits[node_id] = run.visits.get(node_id, 0) + 1
        if run.steps > self.max_steps:
            self._fault(run, node, "maxSteps")
        if run.visits[node_id] > node.max_visits:
            self._fault(run, node, "maxVisits")

    def _advance(self, run: ScenarioRun) -> None:
        """Проходит условия и завершение; останавливается на узле, который ждёт действия."""
        while True:
            node = self.graph.nodes[run.current]
            if node.type == "end":
                run.status, run.outcome = "completed", node.outcome
                self._record(run, "ended", node.id, {"outcome": node.outcome, "by": "graph"})
                return
            if node.type != "condition":
                return
            chosen = next(
                (branch for branch in node.branches if branch.when is not None and evaluate(branch.when, run.facts)),
                node.otherwise,
            )
            assert chosen is not None  # гарантируется проверкой графа
            self._record(run, "branch", node.id, {"branch": chosen.name, "next": chosen.next})
            self._enter(run, chosen.next)
