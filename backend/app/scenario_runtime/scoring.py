"""Подсчёт результата прохождения графа (spec 015 §4): чистая детерминированная функция над журналом прогона."""

from __future__ import annotations

from typing import Any

from app.scenario_runtime.engine import ScenarioRun
from app.scenario_runtime.graph import Graph


def compute_result(graph: Graph, run: ScenarioRun) -> dict[str, Any]:
    wrong_attempts = sum(1 for event in run.events if event.kind == "rejected")
    choice_penalty = sum(int(event.data.get("penalty", 0)) for event in run.events if event.kind == "action")
    path: list[str] = []
    for event in run.events:
        if event.kind in ("started", "action", "branch", "ended") and event.node and (not path or path[-1] != event.node):
            path.append(event.node)
    branches = [str(event.data["branch"]) for event in run.events if event.kind == "branch"]
    end = graph.nodes[run.current] if run.status == "completed" else None
    if end is not None:
        score = max(0, min(100, end.score - wrong_attempts * graph.scoring["wrongActionPenalty"] - choice_penalty))
        passed = end.passed and score >= graph.scoring["passScore"]
        title = end.title or end.outcome
    else:  # прервано студентом или остановлено защитой от циклов
        score, passed, title = 0, False, run.outcome
    return {
        "score": score,
        "passed": bool(passed),
        "outcome": run.outcome,
        "outcomeTitle": title,
        "wrongAttempts": wrong_attempts,
        "steps": run.steps,
        "path": path,
        "branches": branches,
    }
