"""Генератор сценариев-вариаций по группе ЕКП (R21, FR-022, FR-029): шаблонный путь + LLM-путь (Ollama).

Вход: категория (группа ЕКП), учебные карточки банка, адреса справочника (`mocks/local/addresses.json`), число
вариаций и ловушки. Выход — список `{ "scenario": Scenario без id, "cards": [IncidentCard без id] }`:
новые билеты подставляются в сценарий плейсхолдерами `new:<i>` (в `cardIds`, `etalon.expectedActions`,
`etalon.cards`), реальные `c-NNN` назначает сервис при сохранении (`resolve_placeholders`).

Шаблонный путь (детерминирован по категории, без сети): вариация = карточка той же группы + новый адрес из
справочника (к фабуле добавляется место «(место: …)», чтобы вариация отличалась от источника) + ловушка по
параметру. Ловушки (эталон `etalon.cards[id]`, см. `ml.assess.etalon`): `foreignTerritory` — адрес чужой
территории, ожидается «Не принята» с передачей в ОДС района; `operatorMistake` — тип карточки не соответствует
фабуле другой группы, ожидается «Не принята» с передачей профильной службе; `duplicate` — копия карточки с
`duplicateOf`, ожидается «Не принята» с ссылкой на первичную карточку; `crossRegion` — адрес другого региона,
ожидается перевод вызова (`transfer:region`). Эталон действий и ключевые фразы выводятся из ожидаемых служб
билета и строк классификатора (принцип V), не придумываются.

LLM-путь: при `OLLAMA_URL` и живом сервере — запрос с JSON-схемой и ≤ 2 повторами; фабулы и адреса генерирует
модель, эталон строится теми же правилами; при любом сбое — шаблонный путь. Заголовки вариаций детерминированы
(`Вариация N (ИИ): <категория>`), поэтому повторная генерация не создаёт дублей (дедупликация по `title` в сервисе).
"""

from __future__ import annotations

import copy
import json
import random
import re
import zlib
from functools import lru_cache
from pathlib import Path
from typing import Any

from ml.classify import ekp_group_classifier as classifier
from ml.generate import llm

PLACEHOLDER_PREFIX = "new:"
DEFAULT_COUNT = 3
MAX_COUNT = 5
DEFAULT_TRAPS: tuple[str | None, ...] = (None, "foreignTerritory", "operatorMistake")
TRAPS = ("foreignTerritory", "operatorMistake", "duplicate", "crossRegion")
GENERATED_DIFFICULTIES = (3, 4, 5)  # вариации — уровень advanced (spec/05 §6, как в моке фронта)
PRIMARY_REACTION_SEC = 30
FULL_PROCESSING_SEC = 180
MAX_GRAMMAR_ERRORS = 1
REQUIRED_FIELDS = ("dispatcherAction", "outfitNumber")
SYNTAX_REQUIREMENTS = "Полные предложения, без сокращений, адрес и номер наряда без ошибок"
LLM_RETRIES = 2

SERVICE_NUMBER = re.compile(r"^(10[1-4])\b")
SERVICE_PHRASES = {"101": "расчёт направлен", "102": "наряд полиции направлен", "103": "бригада СМП направлена", "104": "аварийная бригада газовой службы направлена"}
MAIN_SERVICE_NUMBERS = {"MCHS": "101", "Police": "102", "AMBULANCE": "103", "MOSGAZ": "104"}
NOTIFICATION_MODES = ("mapped", "card112")
MAX_HINT_SERVICES = 4

LLM_SYSTEM = (
    "Ты методист учебного центра системы-112 Москвы. Составляй реалистичные короткие фабулы обращений заявителей "
    "на русском языке для учебных карточек диспетчера. Не выдумывай улиц: используй адреса только из предложенного списка. "
    "Отвечай строго JSON по схеме."
)
LLM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "tickets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "addressIndex": {"type": "integer"},
                    "callerName": {"type": "string"},
                    "callerStatus": {"type": "string"},
                    "victimsCount": {"type": "integer"},
                    "victimsNote": {"type": "string"},
                    "noAmbulance": {"type": "boolean"},
                },
                "required": ["summary", "addressIndex", "callerName", "callerStatus"],
            },
        }
    },
    "required": ["tickets"],
}


def stable_seed(text: str) -> int:
    return zlib.crc32(text.strip().lower().encode("utf-8"))


def placeholder(index: int) -> str:
    return f"{PLACEHOLDER_PREFIX}{index}"


@lru_cache(maxsize=1)
def _reference() -> dict[str, Any]:
    from app.config import get_settings

    path: Path = get_settings().seed_dir / "spec" / "mocks" / "reference.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def service_numbers(expected_services: list[Any]) -> list[str]:
    """«101 (главная)», «103» → ["101", "103"]; главная — первой."""
    numbers: list[str] = []
    main: str | None = None
    for item in expected_services or []:
        match = SERVICE_NUMBER.match(str(item).strip())
        if not match:
            continue
        number = match.group(1)
        if "главная" in str(item) and main is None:
            main = number
        elif number not in numbers:
            numbers.append(number)
    return ([main] if main else []) + [n for n in numbers if n != main]


def service_title(number: str, reference: dict[str, Any] | None = None) -> str:
    for row in (reference or _reference()).get("services") or []:
        if row.get("id") == f"svc-{number}":
            return str(row.get("shortName") or row.get("name") or number)
    return f"Служба {number}"


def format_address(entry: dict[str, Any]) -> str:
    street = str(entry.get("street") or "").strip()
    parts = [str(entry.get("locality") or "Москва"), street]
    house = str(entry.get("house") or "").strip()
    if house:
        building = str(entry.get("building") or "").strip()
        parts.append(f"{house} корп. {building}" if building else house)
    text = ", ".join(p for p in parts if p)
    for key, label in (("entrance", "под."), ("floor", "эт.")):
        value = str(entry.get(key) or "").strip()
        if value:
            text += f", {label} {value}"
    return text


def usable_addresses(addresses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Адреса с улицей из справочника и номером дома (записи-округа без дома не подходят для билета)."""
    from ml.nlp import address as address_nlp

    return [a for a in addresses if str(a.get("street") or "").strip() and str(a.get("house") or "").strip() and address_nlp.match(str(a["street"])).exact]


def base_cards(category: str, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Карточки-источники группы: исходные билеты (не сгенерированные, не дубли); московские — предпочтительно."""
    own = [c for c in cards if c.get("group") == category and not c.get("baseCardId") and not c.get("duplicateOf")]
    moscow = [c for c in own if not c.get("crossRegion")]
    return moscow or own


def compose_summary(source_summary: str, address_entry: dict[str, Any]) -> str:
    """Фабула + место: «Свист от газовой трубы на кухне (место: жилой дом, Чертаново Южное)».

    Место — в конце: так классификатор видит фабулу первой (согласие с группой источника 89/96 против 85/96 при
    префиксе), а вариация отличается от источника по смыслу (медианный косинус к источнику 0,87 против 0,89 без места).
    """
    place = ", ".join(p for p in (str(address_entry.get("descriptive") or "").strip().lower(), str(address_entry.get("raion") or "").strip()) if p)
    return f"{source_summary} (место: {place})" if place else source_summary


def foreign_fabula(category: str, cards: list[dict[str, Any]], rng: random.Random) -> dict[str, Any] | None:
    """Фабула другой группы с другой главной службой — для ловушки «ошибка оператора 112»."""
    own_numbers = {service_numbers(c.get("expectedServices") or [])[:1][0] for c in cards if c.get("group") == category and service_numbers(c.get("expectedServices") or [])}
    candidates = [c for c in cards if c.get("group") != category and not c.get("baseCardId") and not c.get("duplicateOf") and not c.get("crossRegion") and service_numbers(c.get("expectedServices") or []) and service_numbers(c["expectedServices"])[0] not in own_numbers]
    if not candidates:
        candidates = [c for c in cards if c.get("group") != category and not c.get("baseCardId")]
    if not candidates:
        return None
    return sorted(candidates, key=lambda c: str(c.get("id")))[rng.randrange(len(candidates))]


def build_ticket(base: dict[str, Any], address_entry: dict[str, Any] | None, trap: str | None, category: str, *, fabula: dict[str, Any] | None = None, region_source: dict[str, Any] | None = None) -> dict[str, Any]:
    source = fabula if trap == "operatorMistake" and fabula else base
    ticket: dict[str, Any] = {
        "ticketNo": int(base.get("ticketNo") or 0),
        "situationNo": int(base.get("situationNo") or 0),
        "group": category,
        "summary": str(source.get("summary") or ""),
        "address": str(base.get("address") or ""),
        "caller": copy.deepcopy(source.get("caller") or {}),
        "expectedServices": list(source.get("expectedServices") or []),
        "expectedTags": list(source.get("expectedTags") or []),
        "baseCardId": str(base.get("id") or ""),
    }
    if source is not base:
        ticket["fabulaCardId"] = str(source.get("id") or "")
    for key in ("victims", "noAmbulance"):
        if source.get(key) is not None:
            ticket[key] = copy.deepcopy(source[key])
    if trap == "duplicate":
        ticket["summary"] = str(base.get("summary") or "")
        if base.get("addressRefined"):
            ticket["addressRefined"] = base["addressRefined"]
        if base.get("crossRegion") is not None:
            ticket["crossRegion"] = base["crossRegion"]
        ticket["duplicateOf"] = str(base.get("id") or "")
    elif trap == "crossRegion" and region_source:
        ticket["address"] = str(region_source.get("address") or "")
        if region_source.get("addressRefined"):
            ticket["addressRefined"] = region_source["addressRefined"]
        ticket["crossRegion"] = True
    elif address_entry:
        ticket["address"] = format_address(address_entry)
        if address_entry.get("descriptive"):
            ticket["addressRefined"] = str(address_entry["descriptive"])
        ticket["summary"] = compose_summary(ticket["summary"], address_entry)
        if address_entry.get("raion"):
            ticket["raion"] = str(address_entry["raion"])
    if trap:
        ticket["trap"] = trap
    return ticket


def group_hints(category: str, reference: dict[str, Any], entries: list[dict[str, Any]]) -> tuple[list[str], str | None]:
    """Подсказки и главная служба по строкам классификатора группы (принцип V)."""
    own = [e for e in entries if e.get("group") == category]
    main_codes = [str(e.get("mainService") or "") for e in own if e.get("mainService")]
    main_number = next((MAIN_SERVICE_NUMBERS[c] for c in main_codes if c in MAIN_SERVICE_NUMBERS), None)
    hints: list[str] = [f"Откройте карточку в течение {PRIMARY_REACTION_SEC} секунд и проставьте первичный статус"]
    if main_number:
        hints.append(f"Главная служба по ЕКП — {main_number} ({service_title(main_number, reference)})")
    notified: list[str] = []
    for entry in own:
        for note in entry.get("notifications") or []:
            service = str(note.get("service") or "")
            if note.get("mode") in NOTIFICATION_MODES and service and service not in notified:
                notified.append(service)
    if notified:
        hints.append("Оповещение по ЕКП: " + ", ".join(notified[:MAX_HINT_SERVICES]))
    hints.append("Сверьте фабулу, адрес и тип карточки перед решением о принятии")
    return hints, main_number


def build_etalon(card_ref: str, ticket: dict[str, Any], trap: str | None, base: dict[str, Any], reference: dict[str, Any]) -> dict[str, Any]:
    numbers = service_numbers(ticket.get("expectedServices") or [])
    key_phrases = ["сообщение принято"]
    if trap in ("foreignTerritory", "operatorMistake", "duplicate"):
        if trap == "foreignTerritory":
            to = f"ОДС района {ticket.get('raion')}" if ticket.get("raion") else "ОДС по территории"
            phrases = ["не обслуживаем территорию", f"передано в {to}"]
        elif trap == "operatorMistake":
            to = service_title(numbers[0], reference) if numbers else "профильная служба"
            phrases = ["ошибка классификации оператора 112", f"передано в службу {numbers[0]}" if numbers else "передано в профильную службу"]
        else:
            to = f"карточка {ticket.get('duplicateOf')}"
            phrases = ["дубль карточки", f"реагирование по карточке {ticket.get('duplicateOf')}"]
        return {
            "expectedActions": [f"openCard:{card_ref}", "status:notAccepted"],
            "keyPhrases": phrases,
            "cards": {card_ref: {"expectedDecision": "notAccepted", "expectedTransferTo": to, "trap": trap, "expectedCommentPhrases": phrases}},
        }
    actions = [f"openCard:{card_ref}", "status:accepted"]
    if trap == "crossRegion" or ticket.get("crossRegion"):
        actions.append("transfer:region")
        key_phrases.append("вызов переведён в ЦУС региона")
    else:
        actions.extend(f"call:{n}" for n in numbers)
        key_phrases.extend(SERVICE_PHRASES[n] for n in numbers if n in SERVICE_PHRASES)
    actions.append("status:workDone")
    etalon: dict[str, Any] = {"expectedActions": actions, "keyPhrases": key_phrases}
    if trap == "crossRegion":
        etalon["cards"] = {card_ref: {"trap": "crossRegion"}}
    return etalon


def build_scenario(index: int, category: str, ticket: dict[str, Any], base: dict[str, Any], trap: str | None, *, reference: dict[str, Any], entries: list[dict[str, Any]], provider: str) -> dict[str, Any]:
    card_ref = placeholder(0)
    hints, main_number = group_hints(category, reference, entries)
    numbers = service_numbers(base.get("expectedServices") or [])
    call_target = numbers[0] if numbers else main_number
    scenario: dict[str, Any] = {
        "title": f"Вариация {index + 1} (ИИ): {category}",
        "level": "advanced",
        "sourceTicketNo": int(base.get("ticketNo") or 0),
        "cardIds": [card_ref],
        "timeNorms": {"primaryReactionSec": PRIMARY_REACTION_SEC, "fullProcessingSec": FULL_PROCESSING_SEC},
        "hints": {"enabled": False, "texts": hints},
        "difficulty": GENERATED_DIFFICULTIES[index % len(GENERATED_DIFFICULTIES)],
        "etalon": build_etalon(card_ref, ticket, trap, base, reference),
        "validation": {"status": "pending"},
        "successCriteria": {"maxGrammarErrors": MAX_GRAMMAR_ERRORS, "requiredFields": list(REQUIRED_FIELDS), "syntaxRequirements": SYNTAX_REQUIREMENTS},
        "source": "generated",
        "generation": {"provider": provider, "baseCardId": base.get("id"), "trap": trap, "category": category},
    }
    if call_target:
        scenario["callTarget"] = call_target
    return scenario


def _traps_for(count: int, traps: list[str | None] | None) -> list[str | None]:
    if traps is None:
        return [DEFAULT_TRAPS[i % len(DEFAULT_TRAPS)] for i in range(count)]
    chosen: list[str | None] = []
    for i in range(count):
        trap = traps[i % len(traps)] if traps else None
        chosen.append(trap if trap in TRAPS else None)
    return chosen


def generate_template(category: str, cards: list[dict[str, Any]], addresses: list[dict[str, Any]], *, count: int = DEFAULT_COUNT, traps: list[str | None] | None = None, reference: dict[str, Any] | None = None, entries: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Шаблонные вариации; [] — у категории нет карточек-источников."""
    category = category.strip()
    count = max(1, min(int(count), MAX_COUNT))
    bases = base_cards(category, cards)
    if not bases:
        return []
    reference = reference if reference is not None else _reference()
    entries = entries if entries is not None else list(classifier.classifier_entries())
    rng = random.Random(stable_seed(category))
    address_pool = usable_addresses(addresses)
    region_pool = sorted((c for c in cards if c.get("crossRegion") and not c.get("baseCardId")), key=lambda c: str(c.get("id")))
    start = rng.randrange(len(bases))
    address_start = rng.randrange(len(address_pool)) if address_pool else 0
    results: list[dict[str, Any]] = []
    for index, trap in enumerate(_traps_for(count, traps)):
        base = bases[(start + index) % len(bases)]
        address_entry = address_pool[(address_start + index) % len(address_pool)] if address_pool else None
        fabula = foreign_fabula(category, cards, rng) if trap == "operatorMistake" else None
        region_source = region_pool[index % len(region_pool)] if trap == "crossRegion" and region_pool else None
        if trap == "operatorMistake" and fabula is None:
            trap = None
        if trap == "crossRegion" and region_source is None:
            trap = None
        ticket = build_ticket(base, address_entry, trap, category, fabula=fabula, region_source=region_source)
        scenario = build_scenario(index, category, ticket, base, trap, reference=reference, entries=entries, provider="template")
        results.append({"scenario": scenario, "cards": [ticket]})
    return results


def _llm_prompt(category: str, bases: list[dict[str, Any]], addresses: list[dict[str, Any]], count: int, traps: list[str | None]) -> str:
    examples = "\n".join(f"- {c.get('summary')} (заявитель: {(c.get('caller') or {}).get('status')})" for c in bases[:3])
    address_lines = "\n".join(f"{i}: {format_address(a)} — {a.get('descriptive') or ''}" for i, a in enumerate(addresses))
    trap_lines = "\n".join(f"{i + 1}: {t or 'без ловушки'}" for i, t in enumerate(traps))
    return (
        f"Группа ЕКП: «{category}». Примеры фабул этой группы:\n{examples}\n\n"
        f"Адреса (укажи addressIndex из списка):\n{address_lines}\n\n"
        f"Сгенерируй {count} новых фабул этой группы (1–2 предложения каждая, разные ситуации, без повторов примеров), "
        f"для каждой — ФИО и статус заявителя (очевидец | пострадавший | родственник | знакомый | участник), "
        f"число пострадавших, если они есть, и признак «03 не требуется».\nЛовушки по номерам:\n{trap_lines}\n"
        "Для «operatorMistake» опиши происшествие ДРУГОЙ группы (тип карточки останется прежним)."
    )


def main_number_for_group(group: str, entries: list[dict[str, Any]]) -> str | None:
    codes = [str(e.get("mainService") or "") for e in entries if e.get("group") == group]
    return next((MAIN_SERVICE_NUMBERS[c] for c in codes if c in MAIN_SERVICE_NUMBERS), None)


def _ticket_from_llm(item: dict[str, Any], base: dict[str, Any], addresses: list[dict[str, Any]], trap: str | None, category: str, entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    summary = str(item.get("summary") or "").strip()
    index = item.get("addressIndex")
    if not summary or not isinstance(index, int) or not (0 <= index < len(addresses)):
        return None
    if trap == "crossRegion":
        trap = None  # LLM-путь работает только с московскими адресами справочника
    ticket = build_ticket(base, addresses[index], None, category)
    ticket["summary"] = compose_summary(summary, addresses[index])
    if trap == "operatorMistake":
        # Фабула другой группы: профильную службу для эталона передачи берём из классификатора по предсказанной группе.
        predicted = classifier.predict(summary)
        number = main_number_for_group(predicted.group, entries) if predicted.group and predicted.group != category else None
        if number:
            ticket["expectedServices"] = [f"{number} (главная)"]
        ticket["expectedTags"] = []
    ticket["caller"] = {"name": str(item.get("callerName") or "").strip() or (base.get("caller") or {}).get("name", ""), "phone": (base.get("caller") or {}).get("phone", ""), "status": str(item.get("callerStatus") or "очевидец").strip()}
    count = item.get("victimsCount")
    if isinstance(count, int) and count > 0:
        ticket["victims"] = {"count": count, "note": str(item.get("victimsNote") or "").strip()}
    else:
        ticket.pop("victims", None)
    if item.get("noAmbulance") is True:
        ticket["noAmbulance"] = True
    else:
        ticket.pop("noAmbulance", None)
    if trap:
        ticket["trap"] = trap
    return ticket


def generate_llm(category: str, cards: list[dict[str, Any]], addresses: list[dict[str, Any]], *, count: int, traps: list[str | None], reference: dict[str, Any], entries: list[dict[str, Any]], client: llm.OllamaClient) -> list[dict[str, Any]] | None:
    """LLM-путь; None — сервер недоступен или за LLM_RETRIES попыток не получен корректный ответ."""
    if not client.healthy():
        return None
    bases = base_cards(category, cards)
    address_pool = usable_addresses(addresses)
    if not bases or not address_pool:
        return None
    prompt = _llm_prompt(category, bases, address_pool, count, traps)
    for attempt in range(LLM_RETRIES + 1):
        answer = client.chat_json(LLM_SYSTEM, prompt, LLM_SCHEMA, seed=stable_seed(category) + attempt)
        items = answer.get("tickets") if isinstance(answer, dict) else None
        if not isinstance(items, list) or len(items) < count:
            continue
        results: list[dict[str, Any]] = []
        for index, (item, trap) in enumerate(zip(items[:count], traps, strict=True)):
            base = bases[index % len(bases)]
            ticket = _ticket_from_llm(item, base, address_pool, trap, category, entries) if isinstance(item, dict) else None
            if ticket is None:
                break
            results.append({"scenario": build_scenario(index, category, ticket, base, trap, reference=reference, entries=entries, provider=f"ollama:{client.model}"), "cards": [ticket]})
        if len(results) == count:
            return results
    return None


def generate(category: str, cards: list[dict[str, Any]], addresses: list[dict[str, Any]], *, count: int = DEFAULT_COUNT, traps: list[str | None] | None = None, reference: dict[str, Any] | None = None, entries: list[dict[str, Any]] | None = None, client: llm.OllamaClient | None = None) -> list[dict[str, Any]]:
    """Вариации по категории: LLM при доступном Ollama, иначе шаблон. [] — нет карточек-источников."""
    category = category.strip()
    count = max(1, min(int(count), MAX_COUNT))
    chosen_traps = _traps_for(count, traps)
    reference = reference if reference is not None else _reference()
    entries = entries if entries is not None else list(classifier.classifier_entries())
    client = client if client is not None else llm.configured_client()
    if client is not None:
        produced = generate_llm(category, cards, addresses, count=count, traps=chosen_traps, reference=reference, entries=entries, client=client)
        if produced:
            return produced
    return generate_template(category, cards, addresses, count=count, traps=chosen_traps, reference=reference, entries=entries)


def resolve_placeholders(scenario: dict[str, Any], card_ids: list[str]) -> dict[str, Any]:
    """Заменяет `new:<i>` на назначенные id карточек в cardIds, expectedActions и etalon.cards."""
    mapping = {placeholder(i): card_id for i, card_id in enumerate(card_ids)}

    def swap(value: str) -> str:
        for key, card_id in mapping.items():
            value = value.replace(key, card_id)
        return value

    doc = copy.deepcopy(scenario)
    doc["cardIds"] = [mapping.get(c, c) for c in doc.get("cardIds") or []]
    etalon = doc.get("etalon") or {}
    if isinstance(etalon.get("expectedActions"), list):
        etalon["expectedActions"] = [swap(a) if isinstance(a, str) else a for a in etalon["expectedActions"]]
    if isinstance(etalon.get("cards"), dict):
        etalon["cards"] = {mapping.get(k, k): v for k, v in etalon["cards"].items()}
    return doc
