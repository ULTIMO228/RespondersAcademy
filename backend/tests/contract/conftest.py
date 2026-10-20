"""Общие фикстуры контрактных тестов.

Фича 006: кэш действующих настроек модели (`ai_settings_service`, TTL 5 с) живёт на процесс, а база тестов одна на
сессию. Кэш сбрасывается до и после каждого теста, чтобы настройки одного теста не просачивались в соседние.
"""

from __future__ import annotations

import pytest

from app.services import ai_settings_service


@pytest.fixture(autouse=True)
def _fresh_ai_settings_cache():
    ai_settings_service.invalidate_cache()
    yield
    ai_settings_service.invalidate_cache()
