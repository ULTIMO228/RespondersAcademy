"""Offline checks for the model preparation entry point."""

from __future__ import annotations

import hashlib
import json
import zipfile

import pytest

from ml.scripts import prepare_models


def test_symspell_manifest_detects_tampering(tmp_path, monkeypatch):
    source = tmp_path / "source.txt"
    source.write_bytes(b"sample 42\n")
    monkeypatch.setitem(
        prepare_models.MODELS,
        "symspell",
        {"source": source, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "dir": "symspell", "file": "ru_frequency.txt"},
    )
    target = prepare_models.download("symspell", tmp_path / "models")
    manifest = json.loads((target / ".sha256.json").read_text(encoding="utf-8"))
    assert manifest["files"]["ru_frequency.txt"] == hashlib.sha256(source.read_bytes()).hexdigest()
    (target / "ru_frequency.txt").write_bytes(b"modified")
    with pytest.raises(ValueError, match="контрольная сумма"):
        prepare_models.verify("symspell", tmp_path / "models")


def test_vosk_archive_rejects_path_escape(tmp_path, monkeypatch):
    models = tmp_path / "models"
    archive = models / "_downloads/vosk-model-small-ru-0.22.zip"
    archive.parent.mkdir(parents=True)
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("vosk-model-small-ru-0.22/../escape.txt", "bad")
    spec = dict(prepare_models.MODELS["stt"])
    spec["sha256"] = prepare_models.sha256(archive)
    monkeypatch.setitem(prepare_models.MODELS, "stt", spec)
    with pytest.raises(ValueError, match="Небезопасный путь"):
        prepare_models.download("stt", models)
    assert not (models / "escape.txt").exists()
