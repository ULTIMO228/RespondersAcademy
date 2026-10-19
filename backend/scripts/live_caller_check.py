"""Готов ли живой ИИ-заявитель: что задано, чего не хватает. Ключи не печатаются, сеть не используется.

Из backend/:  uv run python -m scripts.live_caller_check
Код выхода 0 — готов, 1 — чего-то не хватает (список в выводе).
"""
from __future__ import annotations

import importlib.util
import sys

from app.config import get_settings
from app.services import realtime_call_service as call
from ml.speech import vad

REQUIRED = {
    "polza": ("polza_api_key", "live_call_polza_chat_model", "live_call_polza_stt_model", "live_call_polza_tts_model"),
    "cascade": ("live_call_llm_url", "live_call_llm_api_key"),
    "speechkit": ("speechkit_api_key", "live_call_llm_url", "live_call_llm_api_key"),
    "omni": ("live_call_realtime_url",),
}


def problems() -> list[str]:
    settings = get_settings()
    transport = settings.live_call_realtime_transport
    found = []
    if not settings.live_calls_enabled:
        found.append("LIVE_CALLS_ENABLED=true")
    if not settings.live_call_public_ws_url:
        found.append("LIVE_CALL_PUBLIC_WS_URL (ws://127.0.0.1:<порт бэкенда>/api/v1/operator112/realtime)")
    found += [name.upper() for name in REQUIRED[transport] if not getattr(settings, name)]
    if transport != "omni":
        if not importlib.util.find_spec("torch"):
            found.append("torch для Silero VAD: uv sync --extra tts")
        if not vad.model_path().exists():
            found.append("Silero VAD: uv run python -m ml.scripts.prepare_models --only vad")
    return found


def main() -> int:
    settings = get_settings()
    transport = settings.live_call_realtime_transport
    missing = problems()
    print(f"Транспорт живого заявителя: {transport}")
    if transport == "polza":
        print(f"  разговор: {settings.live_call_polza_chat_model or '—'}")
        print(f"  распознавание: {settings.live_call_polza_stt_model or '—'}")
        print(f"  голос: {settings.live_call_polza_tts_model or '—'} ({settings.live_call_polza_tts_voice or 'голос по умолчанию'})")
    elif transport == "speechkit":
        print("  ⚠️ SpeechKit — закрытые модели, вне условия организаторов (только как запасной вариант)")
    if missing:
        print("Не хватает:")
        for item in missing:
            print(f"  • {item}")
        return 1
    print("Готов" if call.configured() else "Настройки заданы, но сервис не считает себя готовым — см. docs/LIVE-CALLER-POLZA.md")
    return 0 if call.configured() else 1


if __name__ == "__main__":
    sys.exit(main())
