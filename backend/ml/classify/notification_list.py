"""Опросная карта → строка ЕКП → итоговый тип и список оповещения (FR-015, памятка стр. 15).

Строка классификатора выбирается по выбранным признакам (`sign1 → sign2 → sign3`, сравнение по нормализованным
строкам, при неполном наборе — первая строка с совпадающим префиксом). Службы списка — `notifications[]` строки
с `mode` ∈ {mapped, card112} (условные реакции включаются с пометкой `condition`); имя службы классификатора
приводится к `reference.services[].id` через `classifierName`, псевдонимы и нечёткое сравнение по названию.
Без сети и моделей, детерминировано.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

NOTIFICATION_MODES = ("mapped", "card112")
SERVICE_MATCH_RATIO = 80
# Имена служб в колонках классификатора ↔ id справочника services (там, где classifierName не задан).
SERVICE_ALIASES: dict[str, str] = {
    "департамент культуры": "svc-dep-kultury",
    "аппарат мэра": "svc-apparat-mera",
    "территориальные оив": "svc-territorial-oiv",
    "территориальные оив тинао": "svc-territorial-oiv-tinao",
    "мкп аналитика": "svc-mkp-analitika",
    "мосгортранс": "svc-mgt",
    "одс псц": "svc-ods-psz",
    "цукб министерство обороны": "svc-cukb-mo",
    "цукб бпла": "svc-cukb-bpla",
    "городское хозяйство": "svc-gorhoz",
    "гку организатор перевозок": "svc-orgperevozki",
    "гку нту": "svc-gku-ntu",
    "росгвардия": "svc-rosgvardiya",
    "оати": "svc-oati",
    "фсб": "svc-fsb",
    "департамент гражданского строительства": "svc-dep-gks",
    "мгтс": "svc-mgts",
    "министерство обороны рхбз": "svc-mo-rhbz",
    "мосводоканал": "svc-mvk",
    "москоллектор": "svc-moskollector",
    "мослифт": "svc-moslift",
    "моэк": "svc-moek",
    "метрополитен": "svc-metro",
    "метро": "svc-metro",
    "мосводосток": "svc-mosvodostok",
    "мосжилинспекция": "svc-moszhilinsp",
    "мособлгаз": "svc-moblgaz",
    "ржд": "svc-rzhd",
    "рсво": "svc-rsvo",
    "фсо": "svc-fso",
    "мгпсс": "svc-mgpss",
    "мсппн": "svc-msppn",
    "ситиэнерго": "svc-cityenergo",
    "центррегионводхоз": "svc-centrregionvodhoz",
    "эважд": "svc-evazhd",
    "канал им. москвы": "svc-kanal-moskvy",
    "комитет ветеринарии": "svc-komitet-vet",
    "комитет по туризму": "svc-komitet-turizm",
    "департамент образования": "svc-dep-obrazovaniya",
    "департамент строительства": "svc-dep-stroitelstva",
    "департамент ппиоос": "svc-dep-ppioos",
    "од департамента тсзн": "svc-od-tszn",
    "дту": "svc-dtu",
    "дгп": "svc-dgp",
    "автодороги": "svc-avtodor",
    "автомобильные дороги ао": "svc-avtodor-ao",
    "военная комендатура": "svc-voenkomendatura",
    "цса им. глинки": "svc-csa-glinki",
    "мосэкомониторинг": "svc-mosecomonitoring",
}
_SPACES = re.compile(r"\s+")
_PARENS = re.compile(r"\([^)]*\)")


def norm(text: object) -> str:
    return _SPACES.sub(" ", str(text or "").replace("ё", "е").strip().lower())


def _service_key(text: object) -> str:
    return norm(_PARENS.sub(" ", str(text or "")))


@dataclass(frozen=True)
class NotificationService:
    service_id: str  # svc-… либо «cls:<имя>» — служба классификатора вне справочника
    title: str
    added_by: str = "auto"  # auto | manual
    mode: str = ""  # mapped | card112 | manual
    condition: str | None = None

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {"serviceId": self.service_id, "addedBy": self.added_by, "title": self.title}
        if self.mode:
            data["mode"] = self.mode
        if self.condition:
            data["condition"] = self.condition
        return data


@dataclass
class NotificationList:
    entry: dict[str, Any] | None
    services: list[NotificationService] = field(default_factory=list)
    conditional: list[NotificationService] = field(default_factory=list)  # условие не выполнено / неизвестно

    @property
    def final_type(self) -> str:
        return str((self.entry or {}).get("finalType") or "")

    @property
    def classifier_code(self) -> str:
        return str((self.entry or {}).get("code") or "")

    @property
    def group(self) -> str:
        return str((self.entry or {}).get("group") or "")

    @property
    def service_ids(self) -> list[str]:
        return [s.service_id for s in self.services]

    def to_contract(self) -> dict[str, Any]:
        return {"finalType": self.final_type, "classifierCode": self.classifier_code, "group": self.group, "services": [s.to_contract() for s in self.services], "conditional": [s.to_contract() for s in self.conditional]}


def entry_signs(entry: dict[str, Any]) -> list[str]:
    return [str(entry.get(key) or "") for key in ("sign1", "sign2", "sign3") if str(entry.get(key) or "").strip()]


def find_entry_by_code(entries: list[dict[str, Any]], code: str) -> dict[str, Any] | None:
    code = str(code or "").strip()
    return next((e for e in entries if str(e.get("code")) == code), None) if code else None


SIGN_MATCH_RATIO = 88


def _same(a: str, b: str) -> bool:
    """«дом» ≈ «жилой дом», «Запах газа в помещении» ≈ «Запах газа в помещении (в доме, в квартире)»."""
    return bool(a and b) and (a == b or fuzz.ratio(a, b) >= SIGN_MATCH_RATIO or fuzz.token_set_ratio(a, b) >= SIGN_MATCH_RATIO)


def find_entry_by_signs(entries: list[dict[str, Any]], signs: list[str], group: str | None = None) -> dict[str, Any] | None:
    """Строка ЕКП по признакам опросной карты (группа/«Происшествие NNN» → признак 1 → 2 → 3).

    Кандидат получает балл за каждый выбранный признак, совпавший с его группой, признаками или итоговым типом
    (нечётко: «Запах газа в помещении» ≈ «Запах газа в помещении (в доме, в квартире)»); при равенстве баллов
    предпочитается строка с меньшим числом лишних признаков — первая по порядку классификатора.
    """
    wanted = [norm(s) for s in signs if norm(s)]
    pool = [e for e in entries if not group or _same(norm(e.get("group")), norm(group))]
    if not wanted:
        return None
    best: tuple[int, int, dict[str, Any]] | None = None
    for entry in pool:
        own = [norm(s) for s in entry_signs(entry)]
        by_signs = sum(1 for sign in wanted if any(_same(sign, o) for o in own))
        by_group = sum(1 for sign in wanted if not any(_same(sign, o) for o in own) and (_same(sign, norm(entry.get("group"))) or _same(sign, norm(entry.get("finalType")))))
        if by_signs + by_group == 0:
            continue
        unmatched_own = sum(1 for o in own if not any(_same(o, sign) for sign in wanted))
        key = (2 * by_signs + by_group, -unmatched_own)
        if best is None or key > (best[0], best[1]):
            best = (key[0], key[1], entry)
    return best[2] if best else None


def find_entry_by_final_type(entries: list[dict[str, Any]], final_type: str) -> dict[str, Any] | None:
    wanted = norm(final_type)
    if not wanted:
        return None
    exact = next((e for e in entries if norm(e.get("finalType")) == wanted or norm(e.get("ekp35Type")) == wanted), None)
    if exact is not None:
        return exact
    scored = max(entries, key=lambda e: fuzz.token_set_ratio(wanted, norm(e.get("finalType"))), default=None)
    return scored if scored is not None and fuzz.token_set_ratio(wanted, norm(scored.get("finalType"))) >= SERVICE_MATCH_RATIO else None


def resolve_service_id(name: str, reference: dict[str, Any]) -> tuple[str, str]:
    """Имя службы из колонки классификатора → (id справочника, название); неизвестная → («cls:<имя>», имя)."""
    services = list(reference.get("services") or [])
    key = _service_key(name)
    for row in services:
        if _service_key(row.get("classifierName")) == key and key:
            return str(row["id"]), str(row.get("shortName") or row.get("name") or name)
    alias = SERVICE_ALIASES.get(key)
    if alias and any(row.get("id") == alias for row in services):
        row = next(r for r in services if r.get("id") == alias)
        return alias, str(row.get("shortName") or row.get("name") or name)
    best_row, best_ratio = None, 0
    for row in services:
        for candidate in (row.get("classifierName"), row.get("shortName"), row.get("name")):
            if not candidate:
                continue
            ratio = fuzz.token_set_ratio(key, _service_key(candidate))
            if ratio > best_ratio:
                best_row, best_ratio = row, ratio
    if best_row is not None and best_ratio >= SERVICE_MATCH_RATIO and len(key) >= 4:
        return str(best_row["id"]), str(best_row.get("shortName") or best_row.get("name") or name)
    return f"cls:{name}", str(name)


# Условия колонок классификатора ↔ флаги/признаки карточки (`what.casualties`, `what.flags`, признаки).
CONDITION_FLAGS: dict[str, tuple[str, ...]] = {
    "пострадавшие": ("пострадавшие", "пострадавшие/погибшие", "injured"),
    "нд": ("нд", "нет доступа"),
    "правонарушение": ("правонарушение",),
    "ул": ("ул", "угроза людям"),
    "пп": ("пп", "перекрытие проезда", "перекрытие движения"),
}
_COND_SELECTED = re.compile(r"^выбран признак (.+)$")
_COND_NOT_SELECTED = re.compile(r"^признак (.+?) не выбран$")


def _flag_keys(flags: list[str]) -> set[str]:
    keys: set[str] = set()
    for flag in flags:
        text = norm(flag)
        for key, aliases in CONDITION_FLAGS.items():
            if text in aliases:
                keys.add(key)
    return keys


def condition_state(condition: str | None, flags: list[str]) -> str:
    """met — условие выполнено флагами карточки; unmet — явно не выполнено; unknown — условие вне флагов (объект из перечня…)."""
    text = norm(condition)
    if not text:
        return "met"
    selected = _flag_keys(flags)
    match = _COND_SELECTED.match(text)
    if match:
        return "met" if match.group(1) in selected else "unmet"
    match = _COND_NOT_SELECTED.match(text)
    if match:
        wanted = [k.strip() for k in match.group(1).replace(" или ", ",").split(",")]
        return "unmet" if any(k in selected for k in wanted) else "met"
    if text in ("признак не выбран", "признаки не выбраны", "другие признаки не выбраны"):
        return "met" if not selected else "unmet"
    if text in ("пострадавшие/погибшие", "мед. помощь"):
        return "met" if "пострадавшие" in selected else "unmet"
    if text == "угроза людям":
        return "met" if "ул" in selected else "unmet"
    if text == "перекрытие движения":
        return "met" if "пп" in selected else "unmet"
    if text == "реагирование всегда":
        return "met"
    return "unknown"


def services_for_entry(entry: dict[str, Any] | None, reference: dict[str, Any], flags: list[str] | None = None) -> tuple[list[NotificationService], list[NotificationService]]:
    """(службы списка оповещения, службы с невыполненным/неизвестным условием — доступны для ручного добавления)."""
    services: list[NotificationService] = []
    conditional: list[NotificationService] = []
    seen: set[str] = set()
    for note in (entry or {}).get("notifications") or []:
        name = str(note.get("service") or "").strip()
        if not name or note.get("mode") not in NOTIFICATION_MODES:
            continue
        service_id, title = resolve_service_id(name, reference)
        condition = str(note.get("condition") or "") or None
        item = NotificationService(service_id=service_id, title=title, added_by="auto", mode=str(note.get("mode")), condition=condition)
        if condition_state(condition, flags or []) == "met":
            if service_id not in seen:
                seen.add(service_id)
                services.append(item)
        elif all(c.service_id != service_id for c in conditional):
            conditional.append(item)
    conditional = [c for c in conditional if c.service_id not in seen]
    return services, conditional


def build(entries: list[dict[str, Any]], reference: dict[str, Any], *, signs: list[str] | None = None, classifier_code: str | None = None, final_type: str | None = None, group: str | None = None, flags: list[str] | None = None, manual: list[dict[str, Any]] | None = None) -> NotificationList:
    """Список оповещения: строка по коду → по признакам → по итоговому типу; условия по флагам; плюс ручные службы."""
    entry = find_entry_by_code(entries, classifier_code or "") or find_entry_by_signs(entries, signs or [], group) or find_entry_by_final_type(entries, final_type or "")
    services, conditional = services_for_entry(entry, reference, flags)
    result = NotificationList(entry=entry, services=services, conditional=conditional)
    known = set(result.service_ids)
    for item in manual or []:
        service_id = str(item.get("serviceId") or "").strip()
        if not service_id or service_id in known:
            continue
        row = next((r for r in reference.get("services") or [] if r.get("id") == service_id), None)
        title = str(row.get("shortName") or row.get("name")) if row else service_id
        result.services.append(NotificationService(service_id=service_id, title=title, added_by="manual", mode="manual"))
        known.add(service_id)
    return result


def expected_service_ids(expected_services: list[Any], reference: dict[str, Any]) -> list[str]:
    """`IncidentCard.expectedServices` («101 (главная)», «103», «МГПСС», «перевод вызова в ЦУС…») → id справочника."""
    ids: list[str] = []
    for item in expected_services or []:
        text = str(item or "").strip()
        number = re.match(r"^(10[1-4])\b", text)
        if number:
            service_id = f"svc-{number.group(1)}"
        elif text.lower().startswith("перевод вызова"):
            continue  # перевод в ЦУС региона — не служба списка оповещения
        else:
            service_id, _ = resolve_service_id(_PARENS.sub(" ", text).strip(), reference)
            if service_id.startswith("cls:"):
                continue
        if service_id not in ids:
            ids.append(service_id)
    return ids


def service_title(service_id: str, reference: dict[str, Any]) -> str:
    row = next((r for r in reference.get("services") or [] if r.get("id") == service_id), None)
    return str(row.get("shortName") or row.get("name")) if row else service_id.removeprefix("cls:")
