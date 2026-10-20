"""Тесты не читают локальный backend/.env: иначе ключи и AI_PROVIDER=polza разработчика
превращают прогон в платные внешние запросы и меняют поведение тестов."""

from app.config import Settings, get_settings


def test_tests_ignore_local_env_file():
    assert Settings.model_config.get("env_file") is None
    settings = get_settings()
    assert settings.ai_provider == "local"
    assert settings.polza_api_key is None and settings.live_calls_enabled is False
