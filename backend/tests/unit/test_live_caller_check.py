from pydantic import SecretStr

from app.config import get_settings
from scripts import live_caller_check as check


def test_lists_what_is_missing_without_printing_secrets(monkeypatch, capsys):
    settings = get_settings()
    for name, value in {"live_calls_enabled": True, "live_call_realtime_transport": "polza",
                        "live_call_public_ws_url": "ws://127.0.0.1:8000/api/v1/operator112/realtime",
                        "polza_api_key": SecretStr("secret-value"), "live_call_polza_chat_model": "z-ai/glm-5.3-flash",
                        "live_call_polza_stt_model": None, "live_call_polza_tts_model": None}.items():
        monkeypatch.setattr(settings, name, value)
    assert check.main() == 1
    out = capsys.readouterr().out
    assert "LIVE_CALL_POLZA_STT_MODEL" in out and "LIVE_CALL_POLZA_TTS_MODEL" in out
    assert "POLZA_API_KEY" not in out.split("Не хватает:")[1]  # ключ задан — не просим
    assert "secret-value" not in out


def test_disabled_live_calls_is_reported(monkeypatch):
    monkeypatch.setattr(get_settings(), "live_calls_enabled", False)
    assert "LIVE_CALLS_ENABLED=true" in check.problems()
