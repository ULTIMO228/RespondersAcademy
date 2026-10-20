"""Шифрование ключа облачной модели в БД (фича 006, research R2).

Fernet (`cryptography` — транзитивная зависимость `python-jose[cryptography]`). Мастер-ключ выводится HKDF-SHA256:
из `AI_SETTINGS_KEY`, если задан, иначе из `JWT_SECRET`. Фиксированная соль и отдельная метка `info` дают ключ,
не совпадающий с материалом подписи сессий. Без секрета окружения шифртекст из дампа БД бесполезен.
Ни ключ, ни мастер-секрет не попадают в `repr`, `str` и тексты исключений.
"""

from __future__ import annotations

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import Settings, get_settings

_SALT = b"arm112-ai-settings-v1"
_INFO_FROM_AI_KEY = b"ai-settings-key/fernet"
_INFO_FROM_JWT = b"ai-settings-key/from-jwt-secret/fernet"


class AiSecretError(Exception):
    """Шифртекст не расшифровывается (другой мастер-ключ или повреждён). Текст без секретов."""


def _derive(material: str, info: bytes) -> bytes:
    raw = HKDF(algorithm=hashes.SHA256(), length=32, salt=_SALT, info=info).derive(material.encode("utf-8"))
    return base64.urlsafe_b64encode(raw)


class SecretBox:
    """Шифратор ключа облака; создаётся из настроек, мастер-ключ хранит только внутри Fernet."""

    __slots__ = ("_fernet", "_origin")

    def __init__(self, fernet: Fernet, origin: str) -> None:
        self._fernet = fernet
        self._origin = origin

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> SecretBox:
        settings = settings or get_settings()
        if settings.ai_settings_key is not None:
            return cls(Fernet(_derive(settings.ai_settings_key.get_secret_value(), _INFO_FROM_AI_KEY)), "AI_SETTINGS_KEY")
        return cls(Fernet(_derive(settings.jwt_secret.get_secret_value(), _INFO_FROM_JWT)), "JWT_SECRET")

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, cipher: str) -> str:
        try:
            return self._fernet.decrypt(cipher.encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError, UnicodeError) as exc:
            raise AiSecretError("Ключ облачной модели не расшифровывается: сменился мастер-ключ или данные повреждены") from exc

    def __repr__(self) -> str:
        return f"SecretBox(master=<{self._origin}, скрыт>)"

    __str__ = __repr__


def last4(plaintext: str) -> str:
    """Последние четыре символа ключа для показа «…abcd» (пробелы по краям отбрасываются)."""
    return plaintext.strip()[-4:]
