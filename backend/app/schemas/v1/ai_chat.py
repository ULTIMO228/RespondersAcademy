"""Контракт чата разбора попытки (фича 010, `POST /api/v1/ai/chat`): camelCase на проводе, как в `src/shared/api/types`.

История на сервере не хранится: клиент присылает последние реплики (не более шести), сервер проверяет роли и длину.
Ответ — всегда с ключами `provider` и `modelName` (в том числе `null` для шаблона), поэтому `dump()` не отбрасывает `None`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.schemas.common import ApiModel

ChatMode = Literal["operator112", "dds"]
ChatRole = Literal["user", "assistant"]
ChatSource = Literal["cloud", "local", "template"]

MESSAGE_MAX = 1000
HISTORY_MAX = 6
REPLY_MAX = 600


class ChatHistoryItem(ApiModel):
    role: ChatRole
    content: str = Field(max_length=MESSAGE_MAX)


class ChatRequest(ApiModel):
    attempt_id: str = Field(min_length=1, max_length=64)
    mode: ChatMode
    message: str = Field(min_length=1, max_length=MESSAGE_MAX)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=HISTORY_MAX)

    @field_validator("message", mode="before")
    @classmethod
    def _trim_message(cls, value: object) -> object:
        # Обрезка до проверки длины: «пустой» вопрос из одних пробелов отклоняется, пробелы по краям не считаются.
        return value.strip() if isinstance(value, str) else value


class ChatResponse(ApiModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore", protected_namespaces=())

    reply: str = Field(min_length=1, max_length=REPLY_MAX)
    source: ChatSource
    provider: str | None = None
    model_name: str | None = None

    def dump(self) -> dict[str, object]:
        """Все ключи на месте: `provider` и `modelName` равны `None`, когда ответил шаблон."""
        return self.model_dump(by_alias=True)
