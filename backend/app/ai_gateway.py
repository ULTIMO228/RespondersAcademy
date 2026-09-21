"""ИИ-шлюз — интерфейс как у фронта (`app/api/mock/_server/ai-gateway.ts`): единая точка подключения ML.

Реализованы локально (backend/ml): оценка попытки, проверка грамматики, инсайты группы.
Генерация сценариев и реплики ИИ-абонента — точки расширения для команды ИИ-агентов: `LocalAiGateway`
отдаёт детерминированные заглушки, замена — через `set_gateway()` или подкласс.
"""

from __future__ import annotations

from typing import Any, Protocol

from ml.assess import adapter, engine
from ml.assess.types import AssessOptions
from ml.nlp import grammar as grammar_nlp


class AiGateway(Protocol):
    def evaluate_attempt(self, attempt: dict[str, Any], scenario: dict[str, Any], cards: dict[str, dict[str, Any]], reference: dict[str, Any], session: dict[str, Any] | None = None, weights: dict[str, float] | None = None, options: AssessOptions | None = None) -> dict[str, Any]: ...

    def check_grammar(self, text: str, field: str = "text") -> list[dict[str, str]]: ...

    def group_insights(self, session: dict[str, Any], reports: list[dict[str, Any]]) -> list[str]: ...

    def generate_scenario(self, category: str, cards: list[dict[str, Any]], count: int = 3) -> list[dict[str, Any]]: ...

    def call_reply(self, to_number: str, turn: str, context: dict[str, Any]) -> dict[str, Any] | None: ...


class LocalAiGateway:
    """Локальная реализация (CPU, офлайн). Все методы детерминированы при одинаковом входе."""

    def evaluate_attempt(self, attempt, scenario, cards, reference, session=None, weights=None, options=None) -> dict[str, Any]:
        result = engine.assess(attempt, scenario, cards, reference, weights=weights, session=session, options=options)
        return adapter.to_evaluation(result)

    def check_grammar(self, text: str, field: str = "text") -> list[dict[str, str]]:
        return [error.to_contract() for error in grammar_nlp.check(text, field)]

    def group_insights(self, session: dict[str, Any], reports: list[dict[str, Any]]) -> list[str]:
        from ml.insights.group_insights import build_insights

        return build_insights(session, reports)

    def generate_scenario(self, category: str, cards: list[dict[str, Any]], count: int = 3) -> list[dict[str, Any]]:
        # Точка подключения генератора (US6, команда ИИ-агентов): пока сценарии не генерируются.
        return []

    def call_reply(self, to_number: str, turn: str, context: dict[str, Any]) -> dict[str, Any] | None:
        # Точка подключения ИИ-абонента (US10, команда ИИ-агентов).
        return None


_gateway: AiGateway | None = None


def get_gateway() -> AiGateway:
    global _gateway
    if _gateway is None:
        _gateway = LocalAiGateway()
    return _gateway


def set_gateway(gateway: AiGateway | None) -> None:
    global _gateway
    _gateway = gateway
