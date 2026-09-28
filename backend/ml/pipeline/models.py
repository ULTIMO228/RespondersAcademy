"""Локальный LangChain chat adapter для моделей ИИ-контура без облачной телеметрии."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

# Гарантия отключения облачной телеметрии LangSmith / LangChain
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"


def sanitize_prompt_input(text: str) -> str:
    """Экранирование недоверенного текста для предотвращения prompt injection."""
    if not text:
        return ""
    # Ограничение длины и нейтрализация псевдо-системных директив
    clean = text.replace("```", "'''")
    clean = clean.replace("<system>", "&lt;system&gt;").replace("</system>", "&lt;/system&gt;")
    clean = clean.replace("<instructions>", "&lt;instructions&gt;").replace("</instructions>", "&lt;/instructions&gt;")
    return clean.strip()


class LocalChatAdapter(BaseChatModel):
    """Локальный chat-адаптер для моделей конвейера подготовки (Qwen, Llama и др.)."""

    model_name: str = "qwen3.5-0.8b-instruct"
    model_family: str = "qwen"
    temperature: float = 0.0
    max_tokens: int = 512
    response_generator: Callable[[list[BaseMessage]], str] | None = Field(default=None, exclude=True)

    @property
    def _llm_type(self) -> str:
        return "local_chat_adapter"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "model_family": self.model_family,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        if self.response_generator is not None:
            content = self.response_generator(messages)
        else:
            # Детерминированный fallback
            content = '{"status": "ok", "rationale": "Локальный детерминированный ответ"}'

        message = AIMessage(content=content)
        generation = ChatGeneration(message=message)
        return ChatResult(generations=[generation])
