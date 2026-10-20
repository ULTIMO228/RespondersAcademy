"""ИИ-тексты отчётов и рекомендаций (фича 006, FR-011/012/014/019).

Три вида текста: комментарий к отчёту попытки (`aiComment`), выводы по группе (`groupInsights`) и пояснение к
рекомендации обучающемуся. Все идут через `ml.generate.llm.complete_json` (выбранный источник → при облачной ошибке
локальная модель → шаблон) и всегда возвращают пометку источника `cloud | local | template`.

Что уходит в запрос: только агрегаты (числа, доли) и формулировки правил из `ERROR_TITLES`. Ни ФИО, ни идентификаторов
людей, попыток и карточек, ни сырых сообщений проверки (в них бывает введённый текст) в промпт не попадают.

Ответ модели проверяется (`validate_text`): русский язык, длина, отсутствие служебных фрагментов. Не прошёл, не
уложился в `TEXT_TIMEOUT_SEC` или модель недоступна — возвращается шаблон, построенный вызывающим, с пометкой `template`.
Результат сохраняется вместе с отчётом (см. `report_builder`) и при просмотре не пересоздаётся.

Вызовы блокирующие, поэтому идут в потоке (`asyncio.to_thread` копирует контекст запроса с `llm_scope`). Зависший
поток при таймауте не прерывается, но ожидание отпускает сразу; факт таймаута дописывается в исходы запроса.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from ml.generate import llm
from ml.insights.group_insights import ERROR_TITLES

TextSource = Literal["cloud", "local", "template"]

TEXT_TIMEOUT_SEC = 20.0  # FR-019: предел ожидания одного текста
NO_DATA_TEXT = "Нет данных по попыткам: курсант не завершил ни одной карточки занятия. Оценка не формировалась — назначьте повторное занятие."
GRAMMAR_TITLE = "орфографические ошибки в ручном вводе"

MIN_LEN = 15
COMMENT_MAX = 600
INSIGHT_MAX = 300
RECOMMENDATION_MAX = 240
MAX_INSIGHTS = 6
MAX_FACT_ERRORS = 5
CYRILLIC_SHARE = 0.8

SOURCE_LABELS: dict[str, str] = {
    "cloud": "облачная модель",
    "local": "локальная модель",
    "template": "шаблон, ИИ недоступен",
}

_CYRILLIC = re.compile("[А-Яа-яЁё]")
# Служебные фрагменты: разметка/код, размышления модели, ссылки, самоназвание модели, маркеры списка.
_SERVICE = re.compile(
    r"[{}\[\]<>`|\\]"
    r"|https?://"
    r"|\b(?:json|schema|system|assistant|user|prompt|null|undefined|nan)\b"
    r"|как\s+(?:языковая\s+)?модель"
    r"|^\s*(?:[-*•#]|\d+[.)])\s",
    re.IGNORECASE | re.MULTILINE,
)

_COMMENT_SYSTEM = (
    "Ты помощник преподавателя диспетчеров службы 112. По числам разбора отчёта курсанта напиши итог в двух-трёх "
    "коротких предложениях по-русски: что получилось, что подтянуть. Без оценок личности, без списков и разметки, "
    "без новых фактов сверх переданных. Ответ — JSON {\"text\": \"...\"}."
)
_GROUP_SYSTEM = (
    "Ты помощник преподавателя диспетчеров службы 112. По сводным числам занятия сформулируй от двух до четырёх "
    "коротких выводов о группе по-русски, по одной фразе. Без имён, без списков и разметки, без новых фактов сверх "
    "переданных. Ответ — JSON {\"items\": [\"...\", \"...\"]}."
)
_RECOMMENDATION_SYSTEM = (
    "Ты помощник преподавателя диспетчеров службы 112. Для каждой рекомендации обучающемуся напиши одну короткую "
    "мотивирующую фразу по-русски: что повторить и почему. Без списков и разметки, без новых фактов. Ключ `key` "
    "возвращай без изменений. Ответ — JSON {\"items\": [{\"key\": \"...\", \"text\": \"...\"}]}."
)
_TEXT_SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
_ITEMS_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "string"}}}, "required": ["items"]}
_KEYED_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"key": {"type": "string"}, "text": {"type": "string"}},
                "required": ["key", "text"],
            },
        }
    },
    "required": ["items"],
}


@dataclass(frozen=True, slots=True)
class AiText:
    """Один текст и его источник; `text=None` у рекомендации без модельной фразы (шаблон)."""

    text: str | None
    source: TextSource
    provider: str | None = None


@dataclass(frozen=True, slots=True)
class AiTexts:
    items: list[str]
    source: TextSource
    provider: str | None = None


# ─── Факты: агрегаты без людей ────────────────────────────────────────────────────────────────────


def _title(error_type: str) -> str:
    return ERROR_TITLES.get(error_type, error_type)


def attempt_facts(scored: Sequence[dict[str, Any]], errors: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Агрегаты отчёта попыток одного курсанта: числа и формулировки правил (без `message`, карточек и ФИО)."""
    exceeded = sum(
        1
        for item in scored
        if item["attempt"]["primaryReactionMs"] > item["norms"]["primaryReactionMs"]
        or item["attempt"]["fullProcessingMs"] > item["norms"]["fullProcessingMs"]
    )
    counts: dict[str, int] = {}
    for error in errors:
        title = _title(str(error.get("type") or "unknown"))
        counts[title] = counts.get(title, 0) + 1
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:MAX_FACT_ERRORS]
    scores = [int(item["score"]) for item in scored if item.get("score") is not None]
    return {
        "attempts": len(scored),
        "exceededNorms": exceeded,
        "errors": [{"title": title, "count": count} for title, count in ranked],
        "critical": sum(1 for error in errors if error.get("severity") == "critical"),
        "score": sum(scores) // len(scores) if scores else 0,
    }


def group_facts(built: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Сводка по группе: число курсантов, средний балл, доли курсантов с типом ошибки, превышение норматива."""
    with_attempts = [item for item in built if item["attempts"]]
    total = len(with_attempts)
    holders: dict[str, int] = {}
    for item in with_attempts:
        kinds = {str(e["type"]) for e in item["report"].get("errors", []) if e.get("type")}
        titles = {_title(kind) for kind in kinds}
        if item["report"].get("grammarErrors"):
            titles.add(GRAMMAR_TITLE)
        for title in titles:
            holders[title] = holders.get(title, 0) + 1
    ranked = sorted(holders.items(), key=lambda pair: (-pair[1], pair[0]))[:MAX_FACT_ERRORS]
    scores = [int(item["report"]["score"]) for item in with_attempts]
    slow = sum(
        1
        for item in with_attempts
        if any(a["attempt"]["primaryReactionMs"] > a["norms"]["primaryReactionMs"] for a in item["attempts"])
    )
    return {
        "students": total,
        "averageScore": sum(scores) // len(scores) if scores else 0,
        "slowReaction": slow,
        "critical": sum(1 for item in with_attempts for e in item["report"].get("errors", []) if e.get("severity") == "critical"),
        "errors": [{"title": title, "share": round(100 * count / total)} for title, count in ranked] if total else [],
    }


# ─── Промпты ──────────────────────────────────────────────────────────────────────────────────────


def attempt_prompt(facts: dict[str, Any]) -> tuple[str, str]:
    errors = "\n".join(f"- {e['title']} (раз: {e['count']})" for e in facts["errors"]) or "- замечаний нет"
    user = (
        f"Отработано карточек: {facts['attempts']}. Нормативы времени превышены в попытках: {facts['exceededNorms']}. "
        f"Критичных замечаний: {facts['critical']}. Средний балл: {facts['score']}.\nЗамечания по эталону:\n{errors}"
    )
    return _COMMENT_SYSTEM, user


def group_prompt(facts: dict[str, Any]) -> tuple[str, str]:
    errors = "\n".join(f"- {e['title']} ({e['share']} % группы)" for e in facts["errors"]) or "- ошибок не зафиксировано"
    user = (
        f"Курсантов с отработанными карточками: {facts['students']}. Средний балл группы: {facts['averageScore']}. "
        f"Превысили норматив первичной реакции: {facts['slowReaction']}. Критичных отклонений: {facts['critical']}.\n"
        f"Типичные ошибки:\n{errors}"
    )
    return _GROUP_SYSTEM, user


def recommendation_prompt(facts: Sequence[dict[str, Any]]) -> tuple[str, str]:
    lines = "\n".join(
        f"- key={f['key']}; вид: {f['kind']}; тема: {f['target']}; слабое место: {f['errorTitle']} (раз: {f['count']})"
        for f in facts
    )
    return _RECOMMENDATION_SYSTEM, f"Рекомендации обучающемуся:\n{lines}"


# ─── Проверка ответа ──────────────────────────────────────────────────────────────────────────────


def validate_text(value: Any, *, max_len: int) -> str | None:
    """Чистый русский текст допустимой длины без служебных фрагментов; иначе `None`."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not MIN_LEN <= len(text) <= max_len or _SERVICE.search(text):
        return None
    letters = [char for char in text if char.isalpha()]
    if not letters or len(_CYRILLIC.findall(text)) / len(letters) < CYRILLIC_SHARE:
        return None
    return text


# ─── Вызов модели с таймаутом ─────────────────────────────────────────────────────────────────────


async def _ask(
    purpose: str,
    prompt: tuple[str, str],
    schema: dict[str, Any],
    *,
    timeout: float | None,
    max_tokens: int,
) -> llm.LlmOutcome | None:
    """Исход модели; `None` — таймаут или сбой (тогда вызывающий берёт шаблон)."""
    system, user = prompt
    limit = TEXT_TIMEOUT_SEC if timeout is None else timeout
    try:
        outcome = await asyncio.wait_for(
            asyncio.to_thread(llm.complete_json, purpose, system, user, schema, max_tokens=max_tokens), limit
        )
    except TimeoutError:
        _record_timeout(purpose, system, user)
        return None
    except Exception:  # noqa: BLE001 — сбой модели не должен ломать построение отчёта
        return None
    return outcome


def _record_timeout(purpose: str, system: str, user: str) -> None:
    """Таймаут — тоже исход запроса: попадёт в `ai_health` как сбой `timeout`, ответ потока придёт позже и не нужен."""
    ctx = llm.current_context()
    if ctx is None:
        return
    active: llm.ActiveSource = "cloud" if ctx.ai is not None and ctx.ai.source == "cloud" else "local"
    ctx.outcomes.append(
        llm.LlmOutcome(
            data=None,
            source="template",
            provider=None,
            reason="timeout",
            purpose=purpose,
            active_source=active,
            request_chars=len(system) + len(user),
            cloud_reserved=active == "cloud" and ctx.cloud_reservations > 0,
        )
    )


def _answered(outcome: llm.LlmOutcome | None) -> dict[str, Any] | None:
    if outcome is None or outcome.source not in ("cloud", "local") or not isinstance(outcome.data, dict):
        return None
    return outcome.data


# ─── Публичные функции ────────────────────────────────────────────────────────────────────────────


async def attempt_comment(facts: dict[str, Any], template: str, *, timeout: float | None = None) -> AiText:
    """Комментарий к отчёту курсанта; без попыток модель не вызывается (нечего комментировать)."""
    if not facts["attempts"]:
        return AiText(template, "template")
    outcome = await _ask("report_comment", attempt_prompt(facts), _TEXT_SCHEMA, timeout=timeout, max_tokens=240)
    data = _answered(outcome)
    text = validate_text(data.get("text"), max_len=COMMENT_MAX) if data else None
    if text is None or outcome is None:
        return AiText(template, "template")
    return AiText(text, outcome.source, outcome.provider)  # type: ignore[arg-type]


async def group_insights(facts: dict[str, Any], template: list[str], *, timeout: float | None = None) -> AiTexts:
    """Выводы по группе; без курсантов с попытками модель не вызывается."""
    if not facts["students"]:
        return AiTexts(list(template), "template")
    outcome = await _ask("report_group_insights", group_prompt(facts), _ITEMS_SCHEMA, timeout=timeout, max_tokens=400)
    data = _answered(outcome)
    raw = data.get("items") if data else None
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_INSIGHTS or outcome is None:
        return AiTexts(list(template), "template")
    items = [validate_text(item, max_len=INSIGHT_MAX) for item in raw]
    if any(item is None for item in items):
        return AiTexts(list(template), "template")
    return AiTexts([item for item in items if item], outcome.source, outcome.provider)  # type: ignore[arg-type]


async def recommendation_texts(facts: Sequence[dict[str, Any]], *, timeout: float | None = None) -> dict[str, AiText]:
    """Пояснения к новым рекомендациям одним запросом; ключ без валидного текста получает `AiText(None, "template")`."""
    if not facts:
        return {}
    outcome = await _ask("recommendation_text", recommendation_prompt(facts), _KEYED_SCHEMA, timeout=timeout, max_tokens=500)
    data = _answered(outcome)
    answers: dict[str, str] = {}
    raw = data.get("items") if data else None
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict) and isinstance(entry.get("key"), str):
                text = validate_text(entry.get("text"), max_len=RECOMMENDATION_MAX)
                if text is not None:
                    answers[entry["key"]] = text
    result: dict[str, AiText] = {}
    for fact in facts:
        text = answers.get(fact["key"])
        if text is None or outcome is None:
            result[fact["key"]] = AiText(None, "template")
        else:
            result[fact["key"]] = AiText(text, outcome.source, outcome.provider)  # type: ignore[arg-type]
    return result
