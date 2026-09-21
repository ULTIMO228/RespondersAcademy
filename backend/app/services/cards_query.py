"""GET /cards: расширенный поиск, вид ленты, датасет, сортировка, пагинация — порт cards-list.ts + filters.ts."""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import QueryParams

from app.api.errors import bad_request
from app.schemas.common import page_response, read_list, read_one_of, read_page, read_string
from app.services.cards import get_fixture_resolver, list_fixtures, list_training_cards, read_runtime
from app.services.fixture_map import project_training_card
from app.services.reference import read_reference
from app.services.time import is_iso, parse_iso_ms

SEARCHABLE_SIGN_LEVELS = 2
AON_CHANNEL = "телефония (АОН)"
FINISHED_CARD_STATUSES = ("completed", "unfinished")
SCALAR_FILTER_KEYS = ("incidentType", "address", "raion", "descriptiveAddress", "region", "description", "applicant", "operator", "cardNumber")
LIST_FILTER_KEYS = {"signs": "sign", "arms": "arm", "okrugs": "okrug", "services": "service", "channels": "channel", "sources": "source"}
_ARM = re.compile(r"АРМ\s*(\d+)", re.IGNORECASE)
_NON_DIGITS = re.compile(r"\D")
_SPACES = re.compile(r"\s+")


def normalize(value: str | None) -> str:
    return _SPACES.sub(" ", (value or "").strip()).lower().replace("ё", "е")


def includes(haystack: str | None, needle: str) -> bool:
    return normalize(needle) in normalize(haystack)


def equals(left: str | None, right: str) -> bool:
    return normalize(left) == normalize(right)


def any_equal(value: str | None, variants: list[str]) -> bool:
    return any(equals(value, v) for v in variants)


def card_arm_number(card: dict[str, Any]) -> str | None:
    match = _ARM.search(card.get("registeredBy", ""))
    return match.group(1) if match else None


def card_region(card: dict[str, Any]) -> str:
    components = [part.strip() for part in (card.get("address") or {}).get("formal", "").split(",")]
    district_index = next((i for i, part in enumerate(components) if part.startswith("(")), -1)
    before = components[: (1 if district_index < 0 else district_index)]
    regions = [part for part in before if normalize(part) != "россия"]
    return regions[-1] if regions else ""


def resolve_channel(card: dict[str, Any]) -> str | None:
    return AON_CHANNEL if (card.get("phones") or {}).get("aon", "").strip() else None


def _matches_applicant(card: dict[str, Any], query: str) -> bool:
    digits = _NON_DIGITS.sub("", query)
    aon = _NON_DIGITS.sub("", (card.get("phones") or {}).get("aon", ""))
    by_phone = bool(digits) and digits in aon
    return by_phone or includes((card.get("applicant") or {}).get("name"), query)


def _matches_operator(card: dict[str, Any], query: str) -> bool:
    texts = [card.get("registeredBy", "")] + [line.get("operator", "") for line in card.get("workLines", [])]
    return any(includes(text, query) for text in texts)


TEXT_RULES: dict[str, Callable[[dict[str, Any], str], bool]] = {
    "incidentType": lambda c, v: includes((c.get("what") or {}).get("finalType"), v) or includes((c.get("what") or {}).get("klass"), v),
    "address": lambda c, v: includes((c.get("address") or {}).get("formal"), v),
    "raion": lambda c, v: equals((c.get("address") or {}).get("raion"), v),
    "descriptiveAddress": lambda c, v: includes((c.get("address") or {}).get("descriptive"), v),
    "region": lambda c, v: equals(card_region(c), v),
    "description": lambda c, v: includes(c.get("description"), v),
    "applicant": _matches_applicant,
    "operator": _matches_operator,
    "cardNumber": lambda c, v: v.strip() in str(c.get("number", "")),
}


def filter_cards(cards: list[dict[str, Any]], filters: dict[str, Any]) -> list[dict[str, Any]]:
    predicates: list[Callable[[dict[str, Any]], bool]] = []
    for field, rule in TEXT_RULES.items():
        value = filters.get(field)
        if isinstance(value, str) and value.strip():
            predicates.append(lambda c, rule=rule, value=value: rule(c, value))

    def add(values: list[str] | None, rule: Callable[[dict[str, Any], list[str]], bool]) -> None:
        active = [v for v in (values or []) if v.strip()]
        if active:
            predicates.append(lambda c, rule=rule, active=active: rule(c, active))

    add(filters.get("signs"), lambda c, signs: any(any_equal(sign, signs) for sign in ((c.get("what") or {}).get("signs") or [])[:SEARCHABLE_SIGN_LEVELS]))
    add(filters.get("arms"), lambda c, arms: (card_arm_number(c) or "") in [a.strip() for a in arms])
    add(filters.get("okrugs"), lambda c, okrugs: any_equal((c.get("address") or {}).get("okrug"), okrugs))
    add(filters.get("services"), lambda c, ids: any(entry.get("serviceId") in ids for entry in c.get("notificationList", [])))
    add(filters.get("channels"), lambda c, channels: any_equal(resolve_channel(c), channels))
    add(filters.get("sources"), lambda c, sources: any_equal(c.get("source"), sources))
    add(filters.get("cardStatuses"), lambda c, statuses: c.get("cardStatus") in statuses)
    created_from, created_to = filters.get("createdFrom"), filters.get("createdTo")
    if created_from or created_to:

        def in_period(c: dict[str, Any]) -> bool:
            created = parse_iso_ms(c.get("createdAt", ""))
            if created_from and created < parse_iso_ms(created_from):
                return False
            return not created_to or created <= parse_iso_ms(created_to)

        predicates.append(in_period)
    return [card for card in cards if all(p(card) for p in predicates)]


def read_filters(params: QueryParams, known_statuses: set[str]) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    for key in SCALAR_FILTER_KEYS:
        value = read_string(params, key)
        if value is not None:
            filters[key] = value
    for field, key in LIST_FILTER_KEYS.items():
        values = read_list(params, key, field)
        if values:
            filters[field] = values
    statuses = read_list(params, "status", "cardStatus", "cardStatuses")
    unknown = next((s for s in statuses if s not in known_statuses), None)
    if unknown:
        raise bad_request(f"Неизвестный статус карточки: {unknown}")
    if statuses:
        filters["cardStatuses"] = statuses
    for key in ("createdFrom", "createdTo"):
        raw = read_string(params, key)
        if raw is not None:
            if not is_iso(raw):
                raise bad_request(f"Некорректная дата параметра «{key}»: {raw}")
            filters[key] = raw
    return filters


def _is_empty(card: dict[str, Any]) -> bool:
    return card.get("cardStatus") in FINISHED_CARD_STATUSES and not card.get("workLines") and not card.get("notificationList")


async def list_cards(db: AsyncSession, params: QueryParams) -> dict[str, Any]:
    page, per_page = read_page(params)
    reference = await read_reference(db)
    known_statuses = {str(d["status"]) for d in reference.get("cardStatuses", [])}
    filters = read_filters(params, known_statuses)
    type_filter = read_string(params, "type")
    q = read_string(params, "q")
    dataset = read_one_of(params, "dataset", ("all", "fixtures", "training"), "all")
    view = read_one_of(params, "view", ("all", "empty", "sms"), "all")
    sort = read_one_of(params, "sort", ("createdAt", "-createdAt"), None)

    source: list[dict[str, Any]] = []
    if dataset != "training":
        source.extend(await list_fixtures(db))
    if dataset != "fixtures":
        resolver = await get_fixture_resolver(db)
        for card in await list_training_cards(db):
            fixture, _ = resolver.resolve(card["group"])
            source.append(project_training_card(card, fixture))

    found = filter_cards(source, filters)
    result: list[dict[str, Any]] = []
    for card in found:
        if view == "empty" and not _is_empty(card):
            continue
        if view == "sms":
            has_sms = bool(card.get("smsList")) or any(s.get("direction") == "incoming" for s in (await read_runtime(db, card["id"]))["sms"])
            if not has_sms:
                continue
        if type_filter and normalize((card.get("what") or {}).get("finalType")) != normalize(type_filter):
            continue
        if q:
            haystack = [str(card.get("number", "")), (card.get("address") or {}).get("formal", ""), (card.get("address") or {}).get("descriptive", ""), (card.get("what") or {}).get("finalType", "")]
            if not any(normalize(q) in normalize(field) for field in haystack):
                continue
        result.append(card)
    if sort:
        result.sort(key=lambda c: parse_iso_ms(c.get("createdAt", "")), reverse=sort.startswith("-"))
    start = (page - 1) * per_page
    return page_response(copy.deepcopy(result[start : start + per_page]), len(result), page, per_page)
