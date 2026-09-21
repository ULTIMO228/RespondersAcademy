"""Дедупликация билетов по смыслу (R1/R22): косинус эмбеддингов «фабула + адрес» к существующим билетам.

Модель — `multilingual-e5-small`, если скачана в MODELS_DIR (`prepare_models.py --only dedup`), иначе
`rubert-tiny2` (всегда есть, если установлен extra `nlp`). Порог дубликата — 0,92 (research R22); при
недоступности эмбеддингов — лексический фолбэк по основам слов (коэффициент Дайса) с `available=False`.
Решение 2026-09-21: e5 не обязателен для демо — rubert-tiny2 даёт те же 1,0 на объявленных дублях сидов.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ml.nlp import embedder
from ml.nlp.semantic import lexical_similarity

DUPLICATE_THRESHOLD = 0.92
LEXICAL_THRESHOLD = 0.9
E5_DIR_NAME = "multilingual-e5-small"
E5_PREFIX = "query: "  # e5 требует префикс задачи для симметричного сравнения

_lock = threading.Lock()
_e5_model = None
_e5_failed = False


def e5_dir() -> Path:
    from app.config import get_settings

    return get_settings().models_dir / E5_DIR_NAME


def _load_e5():
    global _e5_model, _e5_failed
    if _e5_model is not None or _e5_failed:
        return _e5_model
    with _lock:
        if _e5_model is not None or _e5_failed:
            return _e5_model
        if not (e5_dir() / "config.json").exists():
            _e5_failed = True
            return None
        try:
            from sentence_transformers import SentenceTransformer

            _e5_model = SentenceTransformer(str(e5_dir()), device="cpu")
        except Exception:  # noqa: BLE001 — нет torch или битая модель → rubert-tiny2
            _e5_failed = True
            return None
        return _e5_model


def reset() -> None:
    global _e5_model, _e5_failed
    with _lock:
        _e5_model = None
        _e5_failed = False


def model_name() -> str | None:
    """Какая модель считает дубликаты: e5 | rubert-tiny2 | None (лексика)."""
    if _load_e5() is not None:
        return E5_DIR_NAME
    return embedder.MODEL_DIR_NAME if embedder.available() else None


def available() -> bool:
    return model_name() is not None


def encode(texts: list[str]) -> np.ndarray | None:
    model = _load_e5()
    if model is not None:
        with _lock:
            vectors = model.encode([E5_PREFIX + t for t in texts], normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return np.asarray(vectors, dtype=np.float32)
    return embedder.encode(texts)


def ticket_text(ticket: dict) -> str:
    """Текст для сравнения: фабула + адрес (уточнение адреса — тоже часть места)."""
    parts = [str(ticket.get("summary") or ""), str(ticket.get("address") or ""), str(ticket.get("addressRefined") or "")]
    return " ".join(p.strip() for p in parts if p and p.strip())


@dataclass(frozen=True)
class NearestMatch:
    index: int  # позиция в existing или -1
    similarity: float
    available: bool  # True — эмбеддинги, False — лексический фолбэк

    @property
    def duplicate(self) -> bool:
        if self.index < 0:
            return False
        return self.similarity >= (DUPLICATE_THRESHOLD if self.available else LEXICAL_THRESHOLD)


def nearest(text: str, existing: list[str]) -> NearestMatch:
    """Самый близкий существующий текст; пустой список → index -1."""
    if not existing or not text.strip():
        return NearestMatch(index=-1, similarity=0.0, available=available())
    vectors = encode([text, *existing])
    if vectors is None:
        scores = [lexical_similarity(text, other) for other in existing]
        best = int(np.argmax(scores))
        return NearestMatch(index=best, similarity=float(scores[best]), available=False)
    sims = vectors[1:] @ vectors[0]
    best = int(np.argmax(sims))
    return NearestMatch(index=best, similarity=float(np.clip(sims[best], -1.0, 1.0)), available=True)
