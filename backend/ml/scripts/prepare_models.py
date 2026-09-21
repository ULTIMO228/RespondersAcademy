"""Единственная точка сети: скачивает модели в MODELS_DIR один раз (принцип I конституции).

Запуск: `uv run python -m ml.scripts.prepare_models [--only embedder dedup tts]` (по умолчанию — только embedder).
В рантайме модели читаются только с диска; при отсутствии — компоненты работают в режиме фолбэка.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.config import get_settings

MODELS = {
    # Эмбеддер для смыслового сравнения (R1): ≈120 МБ, < 20 мс/фраза на CPU.
    "embedder": {"repo": "cointegrated/rubert-tiny2", "dir": "rubert-tiny2"},
    # Дедупликация сценариев (R1, волна B): ≈470 МБ.
    "dedup": {"repo": "intfloat/multilingual-e5-small", "dir": "multilingual-e5-small"},
    # TTS аудиозаписи обращения (R6, волна B): Silero v4 ru, один файл ≈50 МБ с сайта Silero (не HF).
    "tts": {"url": "https://models.silero.ai/models/tts/ru/v4_ru.pt", "dir": "silero", "file": "v4_ru.pt"},
}
DEFAULT_MODELS = ("embedder",)


def download(name: str, models_dir: Path) -> Path:
    spec = MODELS[name]
    target = models_dir / spec["dir"]
    target.mkdir(parents=True, exist_ok=True)
    if "url" in spec:
        from urllib.request import urlretrieve

        destination = target / spec["file"]
        if not destination.exists():
            tmp = destination.with_suffix(".part")
            urlretrieve(spec["url"], tmp)  # noqa: S310 — фиксированный https-адрес Silero
            tmp.replace(destination)
        return target
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=spec["repo"], local_dir=str(target), allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model", "1_Pooling/*", "2_Dense/*", "modules.json"])
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Загрузка моделей в MODELS_DIR")
    parser.add_argument("--only", nargs="*", choices=sorted(MODELS), default=list(DEFAULT_MODELS))
    args = parser.parse_args(argv)
    models_dir = get_settings().models_dir
    for name in args.only:
        path = download(name, models_dir)
        size = sum(p.stat().st_size for p in path.rglob("*") if p.is_file())
        print(f"{name}: {path} ({size / 1_048_576:.0f} МБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
