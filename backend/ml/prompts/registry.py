"""Проверка целостности промпта и схемы до вызова модели."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


class PromptManifestError(ValueError):
    """Манифест или файл инструкции не прошёл локальную проверку."""


@dataclass(frozen=True)
class PromptAsset:
    version: str
    system_prompt: str
    output_schema: dict[str, object]


def _object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise PromptManifestError(f"{label}: ожидается объект с текстовыми ключами")
    return value


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PromptManifestError(f"{label}: требуется непустая строка")
    return value


def _verified_file(root: Path, entry: dict[str, object], path_key: str, hash_key: str) -> bytes:
    relative = Path(_text(entry.get(path_key), path_key))
    if relative.is_absolute():
        raise PromptManifestError(f"{path_key}: нужен относительный путь")
    try:
        path = (root / relative).resolve(strict=True)
        path.relative_to(root.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise PromptManifestError(f"{path_key}: файл вне корня или отсутствует") from error
    data = path.read_bytes()
    expected = _text(entry.get(hash_key), hash_key)
    if hashlib.sha256(data).hexdigest() != expected:
        raise PromptManifestError(f"{path_key}: хэш не совпадает с манифестом")
    return data


def load_prompt(root: Path, key: str, *, allow_draft: bool = False) -> PromptAsset:
    """Загрузить проверенный промпт; черновик допускается только для локального eval."""
    try:
        manifest = _object(json.loads((root / "backend/ml/prompts/manifest.json").read_text(encoding="utf-8")), "manifest")
    except (OSError, ValueError) as error:
        raise PromptManifestError("manifest: не удалось прочитать JSON") from error

    if manifest.get("schemaVersion") != "prompt-manifest/1":
        raise PromptManifestError("manifest: неизвестная версия схемы")
    status = manifest.get("status")
    if status not in ("draft", "approved"):
        raise PromptManifestError("manifest: неизвестный статус")
    if status != "approved" and not allow_draft:
        raise PromptManifestError("manifest: черновик нельзя использовать в занятии")
    if status == "approved":
        _text(manifest.get("approvedBy"), "approvedBy")
        _text(manifest.get("evalRunId"), "evalRunId")
        _text(manifest.get("chatTemplateHash"), "chatTemplateHash")
        _text(manifest.get("reasoningProfileId"), "reasoningProfileId")

    prompts = _object(manifest.get("prompts"), "prompts")
    entry = _object(prompts.get(key), key)
    version = _text(entry.get("version"), "version")
    try:
        system_prompt = _verified_file(root, entry, "path", "sha256").decode("utf-8")
        schema = _object(json.loads(_verified_file(root, entry, "outputSchema", "outputSchemaSha256")), "outputSchema")
    except (UnicodeError, json.JSONDecodeError) as error:
        raise PromptManifestError(f"{key}: невалидный текст или JSON Schema") from error
    return PromptAsset(version=version, system_prompt=system_prompt, output_schema=schema)
