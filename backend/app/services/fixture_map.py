"""Маппинг учебных карточек (c-NNN) на UI-фикстуры ПОВ-112 — порт src/shared/api/mock/fixture-map.ts."""

from __future__ import annotations

import copy
import re
from collections import Counter
from typing import Any

DEFAULT_FIXTURE_ID = "card-881412"
_DIGITS = re.compile(r"\d+")


class FixtureResolver:
    def __init__(self, fixtures: list[dict[str, Any]], classifier: dict[str, dict[str, Any]]) -> None:
        self.fixtures = sorted(fixtures, key=lambda f: int(f.get("number", 0)))
        self.classifier = classifier  # code → entry
        self._cache: dict[str, tuple[dict[str, Any], str]] = {}
        self._by_group: dict[str, list[dict[str, Any]]] = {}
        for entry in classifier.values():
            self._by_group.setdefault(entry.get("group", ""), []).append(entry)
        self.fallback = next((f for f in self.fixtures if f["id"] == DEFAULT_FIXTURE_ID), self.fixtures[0] if self.fixtures else None)

    def _entry_of(self, fixture: dict[str, Any]) -> dict[str, Any] | None:
        code = (fixture.get("what") or {}).get("classifierCode")
        return self.classifier.get(code) if code else None

    def _dominant_main_service(self, group: str) -> str | None:
        counts = Counter(e["mainService"] for e in self._by_group.get(group, []) if e.get("mainService"))
        if not counts:
            return None
        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return ranked[0][0]

    def resolve(self, group: str) -> tuple[dict[str, Any], str]:
        if group in self._cache:
            return self._cache[group]
        result: tuple[dict[str, Any], str] | None = None
        for fixture in self.fixtures:
            entry = self._entry_of(fixture)
            if entry and entry.get("group") == group:
                result = (fixture, "group")
                break
        if result is None:
            service = self._dominant_main_service(group)
            if service:
                for fixture in self.fixtures:
                    entry = self._entry_of(fixture)
                    if entry and entry.get("mainService") == service:
                        result = (fixture, "mainService")
                        break
        if result is None:
            result = (self.fallback, "default")
        self._cache[group] = result
        return result

    def resolve_id(self, group: str) -> str | None:
        fixture, _ = self.resolve(group)
        return fixture["id"] if fixture else None


def project_training_card(card: dict[str, Any], fixture: dict[str, Any]) -> dict[str, Any]:
    """Списочная проекция учебной карточки поверх фикстуры её группы (projectTrainingCard)."""
    projected = copy.deepcopy(fixture)
    projected.pop("smsList", None)
    match = _DIGITS.search(card["id"])
    caller = card.get("caller") or {}
    projected.update(
        {
            "id": card["id"],
            "number": int(match.group(0)) if match else 0,
            "cardStatus": "registered",
            "phones": {"aon": caller.get("phone", ""), "provided": caller.get("phone", ""), "onSite": ""},
            "applicant": {"name": caller.get("name", ""), "status": caller.get("status") or (fixture.get("applicant") or {}).get("status", "")},
            "address": {"formal": card.get("address", ""), "okrug": "", "raion": "", "descriptive": card.get("addressRefined") or "", "geo": None},
            "description": card.get("summary", ""),
            "workLines": [],
            "notificationList": [],
        }
    )
    return projected
