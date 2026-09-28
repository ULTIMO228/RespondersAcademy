"""Управление рассуждениями модели, лимитами токенов/времени и watchdog (T046)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ReasoningProfile:
    model_revision: str
    runtime_revision: str
    max_output_tokens: int = 512
    timeout_ms: int = 2000
    repetition_stop: bool = True
    thinking_mode: str = "concise"
    chat_template_hash: str | None = None
    validated_at: str | None = None


@dataclass(frozen=True)
class ReasoningCheckResult:
    is_valid: bool
    failure_reason: str | None = None
    details: dict[str, Any] | None = None


def check_reasoning_limits(
    text: str,
    duration_ms: int,
    profile: ReasoningProfile,
) -> ReasoningCheckResult:
    """Проверяет соблюдение ограничений по времени, токенам и повторам."""
    # 1. Проверка таймаута
    if duration_ms > profile.timeout_ms:
        return ReasoningCheckResult(is_valid=False, failure_reason="timeout_exceeded")

    words = text.split()

    # 2. Watchdog циклов и повторов
    if profile.repetition_stop and len(words) >= 6:

        clean_text = text.lower()
        for window in range(1, 4):
            for i in range(len(words) - window * 3):
                phrase = " ".join(words[i : i + window]).lower()
                if clean_text.count(phrase) >= 5:
                    return ReasoningCheckResult(is_valid=False, failure_reason="repetition_detected")

    # 3. Оценка числа токенов (эвристика 1 слово ≈ 1.3 токена)
    estimated_tokens = int(len(words) * 1.3)
    if estimated_tokens > profile.max_output_tokens:
        return ReasoningCheckResult(is_valid=False, failure_reason="max_tokens_exceeded")


    return ReasoningCheckResult(is_valid=True)
