"""Эмбеддер `cointegrated/rubert-tiny2` (R1): ленивая загрузка из MODELS_DIR, кэш векторов, фолбэк без модели.

`encode(texts)` → массив нормированных векторов (косинус = скалярное произведение). Если модель не скачана
(`prepare_models.py`) или не установлен extra `nlp`, `available()` → False и семантика работает в
лексическом режиме (`semantic.py`), помечая компонент `available=false` (FR-043).
"""

from __future__ import annotations

import threading
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_DIR_NAME = "rubert-tiny2"
_lock = threading.Lock()
_model = None
_load_failed = False
_cache: dict[str, np.ndarray] = {}
CACHE_LIMIT = 4096


def model_dir() -> Path:
    from app.config import get_settings

    return get_settings().models_dir / MODEL_DIR_NAME


def _load():
    global _model, _load_failed
    if _model is not None or _load_failed:
        return _model
    with _lock:
        if _model is not None or _load_failed:
            return _model
        path = model_dir()
        if not (path / "config.json").exists():
            _load_failed = True
            return None
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(str(path), device="cpu")
        except Exception:  # noqa: BLE001 — нет torch/sentence-transformers или битая модель → фолбэк
            _load_failed = True
            return None
        return _model


def available() -> bool:
    return _load() is not None


@lru_cache(maxsize=1)
def unavailable_reason() -> str | None:
    if available():
        return None
    path = model_dir()
    if not (path / "config.json").exists():
        return f"модель эмбеддингов не найдена в {path} (запустите prepare_models.py)"
    return "не удалось загрузить модель эмбеддингов (нужен extra `nlp`: torch, sentence-transformers)"


def reset() -> None:
    """Для тестов: сбросить состояние загрузки и кэш."""
    global _model, _load_failed
    with _lock:
        _model = None
        _load_failed = False
        _cache.clear()
    unavailable_reason.cache_clear()


def encode(texts: list[str]) -> np.ndarray | None:
    """Нормированные векторы текстов (n × dim) или None, если модель недоступна."""
    model = _load()
    if model is None:
        return None
    with _lock:  # инференс сериализуем: оценки идут из пула потоков (asyncio.to_thread)
        missing = [t for t in dict.fromkeys(texts) if t not in _cache]
        if missing:
            vectors = model.encode(missing, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
            if len(_cache) + len(missing) > CACHE_LIMIT:
                _cache.clear()
            for text, vector in zip(missing, vectors, strict=True):
                _cache[text] = np.asarray(vector, dtype=np.float32)
        return np.stack([_cache[t] for t in texts]) if texts else np.zeros((0, 1), dtype=np.float32)
