"""Определение графа сценария 112 `scenario-graph/1`: разбор, проверка и вычисление условий.

Модуль чистый: без БД, HTTP, времени, случайности и ИИ. Условия считаются только по фактам прогона,
поэтому один и тот же граф с теми же входами всегда даёт один и тот же маршрут.

Формат (JSON, camelCase)::

    {"schemaVersion": "scenario-graph/1", "start": "<id>", "nodes": [
      {"id": "a", "type": "action", "action": "captureCaller", "next": "b", "maxVisits": 10},
      {"id": "b", "type": "condition",
       "branches": [{"name": "urgent", "when": <предикат>, "next": "c"}],
       "else": {"name": "other", "next": "c"}},
      {"id": "c", "type": "end", "outcome": "completed"}]}

Предикат: `{"fact", "op", "value"}` (op: eq ne in gt ge lt le exists) либо `{"all": [...]}`,
`{"any": [...]}`, `{"not": <предикат>}`. Ветки проверяются по порядку, `else` обязателен.
"""

from __future__ import annotations

import math
from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = "scenario-graph/1"
MAX_NODES = 500
MAX_PREDICATE_DEPTH = 8
MAX_BRANCHES = 50
DEFAULT_MAX_VISITS = 10
ORDER_OPS = ("gt", "ge", "lt", "le")
OPS = ("eq", "ne", "in", "gt", "ge", "lt", "le", "exists")
NODE_TYPES = ("action", "condition", "end")
MAX_TITLE = 160
MAX_PROMPT = 1000
MAX_SETS = 16
MIN_OPTIONS, MAX_OPTIONS = 2, 12
MAX_DECOYS = 20
MAX_COORD = 10000
DEFAULT_SCORING = {"wrongActionPenalty": 5, "passScore": 60}


class InvalidGraphError(ValueError):
    """Граф не прошёл проверку; `errors` содержит все найденные причины."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class Branch:
    name: str
    next: str
    when: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class Option:
    value: Any
    label: str
    penalty: int = 0


@dataclass(frozen=True)
class Node:
    id: str
    type: str
    action: str | None = None
    next: str | None = None
    branches: tuple[Branch, ...] = ()
    otherwise: Branch | None = None
    outcome: str | None = None
    max_visits: int = DEFAULT_MAX_VISITS
    title: str | None = None
    prompt: str | None = None
    label: str | None = None
    sets: Mapping[str, Any] = field(default_factory=dict)
    input_fact: str | None = None
    options: tuple[Option, ...] = ()
    score: int = 100
    passed: bool = True

    def targets(self) -> list[str]:
        if self.type == "action" and self.next:
            return [self.next]
        if self.type == "condition":
            found = [branch.next for branch in self.branches]
            if self.otherwise is not None:
                found.append(self.otherwise.next)
            return found
        return []


def _is_name(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 128


def _is_scalar(value: Any) -> bool:
    if isinstance(value, float):
        return math.isfinite(value)
    return value is None or isinstance(value, (str, int, bool))


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and _is_scalar(value)


def _text(raw: dict[str, Any], key: str, limit: int, where: str, errors: list[str]) -> str | None:
    if key not in raw:
        return None
    value = raw[key]
    if not isinstance(value, str) or not 0 < len(value) <= limit:
        errors.append(f"{where}: {key} — непустая строка до {limit} символов")
        return None
    return value


def _int_in(value: Any, low: int, high: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _parse_sets(raw: dict[str, Any], where: str, errors: list[str]) -> dict[str, Any]:
    if "sets" not in raw:
        return {}
    value = raw["sets"]
    if not isinstance(value, dict) or len(value) > MAX_SETS or not all(_is_name(k) and _is_scalar(v) for k, v in value.items()):
        errors.append(f"{where}: sets — до {MAX_SETS} скалярных фактов с непустыми именами")
        return {}
    return dict(value)


def _parse_input(raw: dict[str, Any], where: str, errors: list[str]) -> tuple[str | None, tuple[Option, ...]]:
    if "input" not in raw:
        return None, ()
    spec = raw["input"]
    if not isinstance(spec, dict) or not _is_name(spec.get("fact")) or not isinstance(spec.get("options"), list):
        errors.append(f"{where}: input требует fact и список options")
        return None, ()
    _extra_keys(spec, {"fact", "options"}, f"{where} input", errors)
    options: list[Option] = []
    for item in spec["options"]:
        if not isinstance(item, dict):
            errors.append(f"{where}: вариант input должен быть объектом")
            continue
        _extra_keys(item, {"value", "label", "penalty"}, f"{where} вариант", errors)
        value, label = item.get("value"), item.get("label")
        penalty = item.get("penalty", 0)
        if value is None or not _is_scalar(value):
            errors.append(f"{where}: value варианта — непустой скаляр")
            continue
        if not isinstance(label, str) or not 0 < len(label) <= MAX_TITLE:
            errors.append(f"{where}: label варианта — непустая строка до {MAX_TITLE} символов")
            continue
        if not _int_in(penalty, 0, 100):
            errors.append(f"{where}: penalty варианта — целое 0–100")
            continue
        options.append(Option(value, label, penalty))
    keys = [(type(o.value), o.value) for o in options]
    if len(set(keys)) != len(keys):
        errors.append(f"{where}: value вариантов повторяется")
    if not MIN_OPTIONS <= len(spec["options"]) <= MAX_OPTIONS:
        errors.append(f"{where}: нужно от {MIN_OPTIONS} до {MAX_OPTIONS} вариантов")
    return spec["fact"], tuple(options)


def _extra_keys(raw: dict[str, Any], allowed: set[str], where: str, errors: list[str]) -> None:
    for key in sorted(set(raw) - allowed, key=str):
        errors.append(f"{where}: лишний ключ «{key}»")


def _check_predicate(pred: Any, where: str, errors: list[str], depth: int = 1) -> None:
    if depth > MAX_PREDICATE_DEPTH:
        errors.append(f"{where}: условие глубже {MAX_PREDICATE_DEPTH} уровней")
        return
    if not isinstance(pred, dict):
        errors.append(f"{where}: условие должно быть объектом")
        return
    if "all" in pred or "any" in pred:
        key = "all" if "all" in pred else "any"
        items = pred[key]
        if len(pred) != 1 or not isinstance(items, list) or not items:
            errors.append(f"{where}: «{key}» — непустой список единственным ключом")
            return
        for item in items:
            _check_predicate(item, where, errors, depth + 1)
    elif "not" in pred:
        if len(pred) != 1:
            errors.append(f"{where}: «not» не сочетается с другими ключами")
            return
        _check_predicate(pred["not"], where, errors, depth + 1)
    else:
        op = pred.get("op")
        if not _is_name(pred.get("fact")):
            errors.append(f"{where}: не задан fact")
        if op not in OPS:
            errors.append(f"{where}: неизвестная операция {op!r}")
        elif op == "exists":
            if "value" in pred:
                errors.append(f"{where}: для exists value не нужен")
        elif "value" not in pred:
            errors.append(f"{where}: для {op} обязателен value")
        elif op == "in":
            items = pred["value"]
            if not isinstance(items, list) or len(items) > MAX_BRANCHES or not all(_is_scalar(i) for i in items):
                errors.append(f"{where}: для in value — список скаляров до {MAX_BRANCHES} элементов")
        elif not _is_scalar(pred["value"]):
            errors.append(f"{where}: value должен быть скаляром (строка, число, булево, null)")
        elif op in ORDER_OPS and not _is_number(pred["value"]):
            errors.append(f"{where}: для {op} value должен быть числом")
        if set(pred) - {"fact", "op", "value"}:
            errors.append(f"{where}: лишние ключи условия")


def evaluate(pred: Mapping[str, Any], facts: Mapping[str, Any]) -> bool:
    """Считает проверенный предикат; несравнимые или отсутствующие значения дают False."""
    if "all" in pred:
        return all(evaluate(item, facts) for item in pred["all"])
    if "any" in pred:
        return any(evaluate(item, facts) for item in pred["any"])
    if "not" in pred:
        return not evaluate(pred["not"], facts)
    fact, op = pred["fact"], pred["op"]
    if op == "exists":
        return fact in facts
    if fact not in facts:
        return False
    actual, expected = facts[fact], pred["value"]
    if op in ORDER_OPS and not (_is_number(actual) and _is_number(expected)):
        return False  # порядок определён только для чисел: bool и строки не сравниваются
    try:
        if op == "eq":
            return bool(actual == expected and type(actual) is type(expected))
        if op == "ne":
            return not (actual == expected and type(actual) is type(expected))
        if op == "in":
            return any(actual == item and type(actual) is type(item) for item in expected)
        if op == "gt":
            return bool(actual > expected)
        if op == "ge":
            return bool(actual >= expected)
        if op == "lt":
            return bool(actual < expected)
        return bool(actual <= expected)
    except TypeError:
        return False


def _parse_branch(raw: Any, where: str, errors: list[str], *, needs_when: bool) -> Branch | None:
    if not isinstance(raw, dict) or not _is_name(raw.get("name")) or not _is_name(raw.get("next")):
        errors.append(f"{where}: ветка требует name и next")
        return None
    _extra_keys(raw, {"name", "next", "when"} if needs_when else {"name", "next"}, where, errors)
    when = raw.get("when")
    if needs_when:
        _check_predicate(when, f"{where} «{raw['name']}»", errors)
    elif "when" in raw:
        errors.append(f"{where}: у else нет условия")
    return Branch(name=raw["name"], next=raw["next"], when=when if needs_when and isinstance(when, dict) else None)


def _parse_node(raw: Any, index: int, errors: list[str]) -> Node | None:
    if not isinstance(raw, dict) or not _is_name(raw.get("id")):
        errors.append(f"nodes[{index}]: не задан id")
        return None
    node_id, kind = raw["id"], raw.get("type")
    where = f"узел «{node_id}»"
    if kind not in NODE_TYPES:
        errors.append(f"{where}: неизвестный тип {kind!r}")
        return None
    _extra_keys(
        raw,
        {
            "action": {"id", "type", "title", "prompt", "action", "label", "sets", "input", "next", "maxVisits"},
            "condition": {"id", "type", "title", "branches", "else", "maxVisits"},
            "end": {"id", "type", "title", "prompt", "outcome", "score", "passed"},
        }[kind],
        where,
        errors,
    )
    visits = raw.get("maxVisits", DEFAULT_MAX_VISITS)
    if not isinstance(visits, int) or isinstance(visits, bool) or not 1 <= visits <= 1000:
        errors.append(f"{where}: maxVisits должен быть целым 1–1000")
        visits = DEFAULT_MAX_VISITS
    title = _text(raw, "title", MAX_TITLE, where, errors)
    if kind == "action":
        if not _is_name(raw.get("action")) or not _is_name(raw.get("next")):
            errors.append(f"{where}: действие требует action и next")
            return None
        input_fact, options = _parse_input(raw, where, errors)
        return Node(
            node_id, kind, action=raw["action"], next=raw["next"], max_visits=visits, title=title,
            prompt=_text(raw, "prompt", MAX_PROMPT, where, errors), label=_text(raw, "label", MAX_TITLE, where, errors),
            sets=_parse_sets(raw, where, errors), input_fact=input_fact, options=options,
        )
    if kind == "end":
        if not _is_name(raw.get("outcome")):
            errors.append(f"{where}: для end нужен непустой outcome")
            return None
        score, passed = raw.get("score", 100), raw.get("passed", True)
        if not _int_in(score, 0, 100):
            errors.append(f"{where}: score — целое 0–100")
            score = 100
        if not isinstance(passed, bool):
            errors.append(f"{where}: passed должен быть булевым")
            passed = True
        return Node(
            node_id, kind, outcome=raw["outcome"], max_visits=visits, title=title,
            prompt=_text(raw, "prompt", MAX_PROMPT, where, errors), score=score, passed=passed,
        )
    branches_raw = raw.get("branches")
    if not isinstance(branches_raw, list) or not branches_raw:
        errors.append(f"{where}: условие требует непустой список branches")
        branches_raw = []
    elif len(branches_raw) > MAX_BRANCHES:
        errors.append(f"{where}: веток больше {MAX_BRANCHES}")
        branches_raw = []
    branches = [_parse_branch(item, where, errors, needs_when=True) for item in branches_raw]
    if "else" not in raw:
        errors.append(f"{where}: обязательна ветка else")
        otherwise = None
    else:
        otherwise = _parse_branch(raw["else"], where, errors, needs_when=False)
    parsed = [branch for branch in branches if branch is not None]
    names = [branch.name for branch in parsed] + ([otherwise.name] if otherwise else [])
    if len(set(names)) != len(names):
        errors.append(f"{where}: имя ветки повторяется")
    return Node(node_id, kind, branches=tuple(parsed), otherwise=otherwise, max_visits=visits, title=title)


def _parse_decoys(data: dict[str, Any], nodes: dict[str, Node], errors: list[str]) -> tuple[tuple[str, str], ...]:
    raw = data.get("decoys", [])
    if not isinstance(raw, list) or len(raw) > MAX_DECOYS:
        errors.append(f"decoys — список до {MAX_DECOYS} элементов")
        return ()
    real = {n.action for n in nodes.values() if n.type == "action"}
    seen: set[str] = set()
    found: list[tuple[str, str]] = []
    for item in raw:
        if not isinstance(item, dict) or not _is_name(item.get("action")) or not isinstance(item.get("label"), str) or not 0 < len(item["label"]) <= MAX_TITLE:
            errors.append("decoys: элемент требует action и label")
            continue
        _extra_keys(item, {"action", "label"}, "decoys", errors)
        if item["action"] in real or item["action"] in seen:
            errors.append(f"decoys: действие «{item['action']}» совпадает с действием графа или повторяется")
            continue
        seen.add(item["action"])
        found.append((item["action"], item["label"]))
    return tuple(found)


def _parse_scoring(data: dict[str, Any], errors: list[str]) -> dict[str, int]:
    scoring = dict(DEFAULT_SCORING)
    raw = data.get("scoring")
    if raw is None:
        return scoring
    if not isinstance(raw, dict):
        errors.append("scoring должен быть объектом")
        return scoring
    _extra_keys(raw, set(DEFAULT_SCORING), "scoring", errors)
    for key, high in (("wrongActionPenalty", 50), ("passScore", 100)):
        if key in raw:
            if _int_in(raw[key], 0, high):
                scoring[key] = raw[key]
            else:
                errors.append(f"scoring: {key} — целое 0–{high}")
    return scoring


def _parse_layout(data: dict[str, Any], nodes: dict[str, Node], errors: list[str]) -> dict[str, dict[str, float]]:
    raw = data.get("layout")
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        errors.append("layout должен быть объектом")
        return {}
    found: dict[str, dict[str, float]] = {}
    for node_id, point in raw.items():
        ok = (
            node_id in nodes
            and isinstance(point, dict)
            and set(point) == {"x", "y"}
            and all(
                isinstance(point[k], (int, float)) and not isinstance(point[k], bool)
                and math.isfinite(point[k]) and abs(point[k]) <= MAX_COORD
                for k in ("x", "y")
            )
        )
        if not ok:
            errors.append(f"layout: узел «{node_id}» неизвестен или координаты некорректны (x, y — числа в пределах ±{MAX_COORD})")
            continue
        found[node_id] = {"x": point["x"], "y": point["y"]}
    return found


@dataclass(frozen=True)
class Graph:
    start: str
    nodes: Mapping[str, Node]
    decoys: tuple[tuple[str, str], ...] = ()
    scoring: Mapping[str, int] = field(default_factory=lambda: dict(DEFAULT_SCORING))
    layout: Mapping[str, Mapping[str, float]] = field(default_factory=dict)

    def action_catalog(self) -> list[dict[str, str]]:
        """Кнопки выбора обучающегося: подписи всех шагов-действий графа и ложных вариантов, по алфавиту подписи."""
        found: dict[str, str] = {}
        for node in self.nodes.values():
            if node.type == "action" and node.action:
                found.setdefault(node.action, node.label or node.action)
        for code, label in self.decoys:
            found.setdefault(code, label)
        return [{"action": c, "label": lb} for c, lb in sorted(found.items(), key=lambda i: (i[1].casefold(), i[0]))]

    @classmethod
    def parse(cls, data: Any) -> Graph:
        errors: list[str] = []
        if not isinstance(data, dict):
            raise InvalidGraphError(["граф должен быть объектом"])
        _extra_keys(data, {"schemaVersion", "start", "nodes", "decoys", "scoring", "layout"}, "граф", errors)
        if data.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"schemaVersion должен быть {SCHEMA_VERSION}")
        raw_nodes = data.get("nodes")
        if not isinstance(raw_nodes, list) or not raw_nodes:
            raise InvalidGraphError([*errors, "nodes должен быть непустым списком"])
        if len(raw_nodes) > MAX_NODES:
            raise InvalidGraphError([*errors, f"узлов больше {MAX_NODES}"])
        nodes: dict[str, Node] = {}
        for index, raw in enumerate(raw_nodes):
            node = _parse_node(raw, index, errors)
            if node is None:
                continue
            if node.id in nodes:
                errors.append(f"дублирующийся id узла «{node.id}»")
            nodes[node.id] = nodes.get(node.id, node)
        start = data.get("start")
        if not _is_name(start) or start not in nodes:
            errors.append(f"start «{start}» не найден среди узлов")
        for node in nodes.values():
            for target in node.targets():
                if target not in nodes:
                    errors.append(f"узел «{node.id}»: переход в несуществующий узел «{target}»")
        if not errors:
            cls._check_topology(str(start), nodes, errors)
        decoys = _parse_decoys(data, nodes, errors)
        scoring = _parse_scoring(data, errors)
        layout = _parse_layout(data, nodes, errors)
        if errors:
            raise InvalidGraphError(errors)
        return cls(start=str(start), nodes=nodes, decoys=decoys, scoring=scoring, layout=layout)

    @staticmethod
    def _check_topology(start: str, nodes: dict[str, Node], errors: list[str]) -> None:
        seen, queue = {start}, deque([start])
        while queue:
            for target in nodes[queue.popleft()].targets():
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        for node_id in nodes:
            if node_id not in seen:
                errors.append(f"узел «{node_id}» недостижим из start")
        reverse: dict[str, list[str]] = {node_id: [] for node_id in nodes}
        for node in nodes.values():
            for target in node.targets():
                reverse[target].append(node.id)
        alive = {node_id for node_id, node in nodes.items() if node.type == "end"}
        queue = deque(alive)
        while queue:
            for source in reverse[queue.popleft()]:
                if source not in alive:
                    alive.add(source)
                    queue.append(source)
        for node_id in seen - alive:
            errors.append(f"из узла «{node_id}» нельзя дойти до завершения")
        # Цикл из одних условий не ждёт действий и крутился бы бесконечно.
        auto = {node_id for node_id, node in nodes.items() if node.type == "condition"}
        color: dict[str, int] = {}
        for origin in auto:
            if origin in color:
                continue
            stack = [(origin, iter(nodes[origin].targets()))]
            color[origin] = 1
            while stack:
                current, targets = stack[-1]
                advanced = False
                for target in targets:
                    if target not in auto:
                        continue
                    if color.get(target) == 1:
                        errors.append(f"цикл из одних условий через «{target}»")
                    elif target not in color:
                        color[target] = 1
                        stack.append((target, iter(nodes[target].targets())))
                        advanced = True
                        break
                if not advanced:
                    color[current] = 2
                    stack.pop()
