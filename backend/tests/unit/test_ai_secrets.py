"""Шифрование ключа облачной модели (фича 006, T004): Fernet, мастер-ключ из AI_SETTINGS_KEY либо HKDF от JWT_SECRET.

Настройки собираются без `backend/.env` (`_env_file=None`), чтобы тест не зависел от окружения машины.
Сравнения с ключом пишутся через `in`/`==` на булевом уровне: при падении значение ключа не печатается.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.services.ai_secrets import AiSecretError, SecretBox, last4

JWT_A = "a" * 40
JWT_B = "b" * 40
API_KEY = "pza-test-0123456789abcdef-XYZW"


def _settings(jwt: str = JWT_A, ai_key: str | None = None) -> Settings:
    values: dict[str, str] = {"JWT_SECRET": jwt}
    if ai_key is not None:
        values["AI_SETTINGS_KEY"] = ai_key
    return Settings(_env_file=None, **values)


def test_cipher_differs_from_plaintext_and_roundtrips():
    box = SecretBox.from_settings(_settings())
    cipher = box.encrypt(API_KEY)
    assert (API_KEY in cipher) is False
    assert (box.decrypt(cipher) == API_KEY) is True


def test_wrong_master_key_raises_without_leaking_secret():
    cipher = SecretBox.from_settings(_settings(jwt=JWT_A)).encrypt(API_KEY)
    other = SecretBox.from_settings(_settings(jwt=JWT_B))
    with pytest.raises(AiSecretError) as caught:
        other.decrypt(cipher)
    assert (API_KEY in str(caught.value)) is False


def test_garbage_cipher_raises_ai_secret_error():
    with pytest.raises(AiSecretError):
        SecretBox.from_settings(_settings()).decrypt("не-шифртекст")


def test_ai_settings_key_takes_precedence_over_jwt_secret():
    ai_key = "k" * 40
    with_ai = SecretBox.from_settings(_settings(jwt=JWT_A, ai_key=ai_key))
    cipher = with_ai.encrypt(API_KEY)
    # Тот же AI_SETTINGS_KEY при другом JWT_SECRET расшифровывает: мастер-ключ взят не из JWT.
    assert (SecretBox.from_settings(_settings(jwt=JWT_B, ai_key=ai_key)).decrypt(cipher) == API_KEY) is True
    # Без AI_SETTINGS_KEY (только JWT_SECRET) — другой мастер-ключ.
    with pytest.raises(AiSecretError):
        SecretBox.from_settings(_settings(jwt=JWT_A)).decrypt(cipher)


def test_jwt_derived_key_is_stable_across_instances():
    cipher = SecretBox.from_settings(_settings()).encrypt(API_KEY)
    assert (SecretBox.from_settings(_settings()).decrypt(cipher) == API_KEY) is True


def test_short_ai_settings_key_is_rejected():
    with pytest.raises(ValueError):
        _settings(ai_key="short")


def test_repr_and_str_do_not_contain_master_or_jwt_secret():
    box = SecretBox.from_settings(_settings(ai_key="m" * 40))
    for text in (repr(box), str(box)):
        assert (JWT_A in text) is False
        assert ("m" * 40 in text) is False


def test_last4():
    assert last4(API_KEY) == "XYZW"
    assert last4("  ab  ") == "ab"
    assert last4("") == ""
