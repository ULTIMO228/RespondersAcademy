"""ИИ-шлюз — интерфейс как у фронта (`app/api/mock/_server/ai-gateway.ts`): единая точка подключения ML.

Реализованы локально (backend/ml): оценка попытки, проверка грамматики, инсайты группы, генерация сценариев
(`ml.generate.scenario_generator`: шаблонный путь всегда, LLM-путь через Ollama при `OLLAMA_URL`, решение
2026-09-21). Реплики ИИ-абонента — точка расширения команды ИИ-агентов: заглушка `None`, при которой
`compat/calls` использует детерминированный `ml.insights.call_responder` (решение US10, 2026-09-21).

Граница для команды ИИ-агентов: заменить реализацию можно через `set_gateway()` или подклассом `LocalAiGateway`,
не меняя эндпоинты. Контракт `generate_scenario`: вход — категория (группа ЕКП), карточки банка (контракт
`IncidentCard`), адреса справочника, число вариаций и ловушки; выход — список `{ "scenario": Scenario без id,
"cards": [IncidentCard без id] }` с плейсхолдерами `new:<i>` (см. `ml.generate.scenario_generator`). Сервис
сам назначает id, прогоняет валидатор и пишет аудит — реализации шлюза этого делать не нужно.
Контракт `call_reply`: вход — номер точки C, ход `answer`/`reply`, `context = { "number": InternalNumber,
"text": реплика диспетчера, "reference": Reference }`; выход — `{ text, voice: male|female, speakerTitle }` либо `None`
(тогда отвечает детерминированный ответчик). Сверку доклада с чек-листом выполняет бэкенд при записи вызова.
Контракт `call_script` (US3, решение 2026-09-22): вход — билет (`IncidentCard`) и `context = { "voice": male|female,
"reference": Reference }`; выход — текст реплики заявителя (все факты билета разговорным языком) либо `None`, тогда
берётся шаблон `ml.generate.call_script`. Озвучивание (Silero) и оценка карточки остаются на стороне бэкенда.
Контракт `explain_stage` (фича 003, US6; необязательный метод — реализация шлюза без него тоже допустима): вход —
режим `operator112`/`dds`, этап `{ id, title }`, типовые ошибки этапа `[{ ruleId, plainText, severity, studentCount }]`
(не больше трёх, самая частая первой) и `context = { subject: group|student, level: { level, share, attempts,
attemptsWithError, affectedStudents } }`; выход — текст из одной-двух фраз на русском о вероятной причине либо `None`,
тогда бэкенд берёт шаблон «справочное пояснение». Бэкенд сам ограничивает длину и число фраз, пометку «ИИ» и вердикт
преподавателя ставит интерфейс; ответ никогда не меняет светофор и оценки. Штатная реализация зовёт модель через
`ml.generate.llm.complete_json` (фича 006): по умолчанию локальная модель, облако — только при выбранном и разрешённом
облачном источнике; без модели — шаблон.
"""

from __future__ import annotations

from typing import Any, Protocol

from ml.assess import adapter, engine
from ml.assess.types import AssessOptions
from ml.nlp import grammar as grammar_nlp


class AiGateway(Protocol):
    def get_active_release_id(self) -> str | None: ...

    def evaluate_attempt(self, attempt: dict[str, Any], scenario: dict[str, Any], cards: dict[str, dict[str, Any]], reference: dict[str, Any], session: dict[str, Any] | None = None, weights: dict[str, float] | None = None, options: AssessOptions | None = None) -> dict[str, Any]: ...


    def check_grammar(self, text: str, field: str = "text") -> list[dict[str, str]]: ...

    def group_insights(self, session: dict[str, Any], reports: list[dict[str, Any]]) -> list[str]: ...

    def generate_scenario(self, category: str, cards: list[dict[str, Any]], addresses: list[dict[str, Any]], *, count: int = 3, traps: list[str | None] | None = None) -> list[dict[str, Any]]: ...

    def call_reply(self, to_number: str, turn: str, context: dict[str, Any]) -> dict[str, Any] | None: ...

    def call_script(self, ticket: dict[str, Any], context: dict[str, Any]) -> str | None: ...

    def explain_stage(self, mode: str, stage: dict[str, Any], errors: list[dict[str, Any]], context: dict[str, Any]) -> str | None: ...

    def resolve_semantic_dispute(
        self,
        text: str,
        reference_fact_ids: list[str],
        mode: str,
        reason: str,
        versions: dict[str, Any] | None = None,
        reference_facts_map: dict[str, str] | None = None,
    ) -> dict[str, Any]: ...


class LocalAiGateway:
    """Локальная реализация (CPU, офлайн). Все методы детерминированы при одинаковом входе."""

    def evaluate_attempt(self, attempt, scenario, cards, reference, session=None, weights=None, options=None) -> dict[str, Any]:
        result = engine.assess(attempt, scenario, cards, reference, weights=weights, session=session, options=options)
        return adapter.to_evaluation(result)

    def check_grammar(self, text: str, field: str = "text") -> list[dict[str, str]]:
        return [error.to_contract() for error in grammar_nlp.check_field(text, field)]

    def group_insights(self, session: dict[str, Any], reports: list[dict[str, Any]]) -> list[str]:
        from ml.insights.group_insights import build_insights

        return build_insights(session, reports)

    def generate_scenario(self, category: str, cards: list[dict[str, Any]], addresses: list[dict[str, Any]], *, count: int = 3, traps: list[str | None] | None = None) -> list[dict[str, Any]]:
        from ml.generate import scenario_generator

        return scenario_generator.generate(category, cards, addresses, count=count, traps=traps)

    def call_reply(self, to_number: str, turn: str, context: dict[str, Any]) -> dict[str, Any] | None:
        # Точка подключения ИИ-абонента (US10, команда ИИ-агентов); None → ml.insights.call_responder в compat/calls.
        return None

    def call_script(self, ticket: dict[str, Any], context: dict[str, Any]) -> str | None:
        # Точка подключения LLM-генерации реплики заявителя (US3, команда ИИ-агентов); None → ml.generate.call_script.
        return None

    def explain_stage(self, mode: str, stage: dict[str, Any], errors: list[dict[str, Any]], context: dict[str, Any]) -> str | None:
        # Фича 006 (T029): вызов всегда через `complete_json` — выбранный источник (облако только при разрешении,
        # иначе локальная модель) → при облачной ошибке локальная (FR-018) → None → шаблон в `error_map_explain`.
        # Исход (кто ответил) пишется в контекст запроса (`ai_health_service.llm_scope`), по нему сервис ставит
        # `sourceKind`. Имена и id обучающихся не передаются: только название этапа, формулировки правил и числа.
        from ml.generate import llm

        listing = "\n".join(f"- {item['plainText']} (обучающихся: {item['studentCount']})" for item in errors)
        user = (
            f"Режим: {mode}. Этап: «{stage['title']}». Типовые ошибки:\n{listing or '- нет'}\n"
            "Объясни в одной-двух фразах, почему так может происходить."
        )
        system = (
            "Ты помощник преподавателя диспетчеров. Отвечай по-русски, одной-двумя короткими фразами, "
            "без оценок людей, без терминов и списков. Ответ — JSON {\"text\": \"...\"}."
        )
        schema = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
        answer = llm.complete_json("error_map_explain", system, user, schema, max_tokens=200).data
        text = answer.get("text") if isinstance(answer, dict) else None
        return text if isinstance(text, str) and text.strip() else None

    def get_active_release_id(self) -> str | None:
        try:
            from ml.release import get_active_release

            rel = get_active_release()
            return rel.id if rel else None
        except Exception:
            return None

    def resolve_semantic_dispute(
        self,
        text: str,
        reference_fact_ids: list[str],
        mode: str,
        reason: str,
        versions: dict[str, Any] | None = None,
        reference_facts_map: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Разрешение спора семантики второго эшелона (US2, T021, T051)."""
        rel_id = self.get_active_release_id()
        clean_text = (text or "").strip()
        clean_fact_ids = [fid for fid in reference_fact_ids if isinstance(fid, str) and fid.strip()][:12]
        if not clean_text or not clean_fact_ids:
            res = {
                "decision": "uncertain",
                "referenceFactIds": clean_fact_ids,
                "explanation": "Недостаточно данных для разрешения спора; требуется ручная проверка преподавателем.",
            }
            if rel_id is not None:
                res["modelReleaseId"] = rel_id
            return res
        try:
            from ml.nlp import semantic

            facts_map = reference_facts_map or {}
            fact_texts = [facts_map.get(fid, fid) for fid in clean_fact_ids]
            coverage = semantic.covers_key_phrases(clean_text, fact_texts, threshold=0.75)
            if coverage.score >= 0.8:
                decision = "equivalent"
                explanation = "Текст содержит подтверждение переданных смысловых фактов."
            elif coverage.score < 0.5:
                decision = "different"
                explanation = "Смысловые факты не обнаружены в предоставленном тексте."
            else:
                decision = "uncertain"
                explanation = "Пограничное смысловое соответствие, требуется арбитраж преподавателя."
            res = {
                "decision": decision,
                "referenceFactIds": clean_fact_ids,
                "explanation": explanation[:500],
                "confidence": round(coverage.score, 2),
            }
            if rel_id is not None:
                res["modelReleaseId"] = rel_id
            return res
        except Exception:
            res = {
                "decision": "uncertain",
                "referenceFactIds": clean_fact_ids,
                "explanation": "Ошибка при автоматическом разрешении спора; требуется ручная проверка преподавателем.",
            }
            if rel_id is not None:
                res["modelReleaseId"] = rel_id
            return res



_gateway: AiGateway | None = None


def get_gateway() -> AiGateway:
    global _gateway
    if _gateway is None:
        _gateway = LocalAiGateway()
    return _gateway


def set_gateway(gateway: AiGateway | None) -> None:
    global _gateway
    _gateway = gateway
