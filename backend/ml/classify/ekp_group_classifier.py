"""Классификатор группы ЕКП по тексту фабулы (R4, SC-006): эмбеддинги rubert-tiny2 + логистическая регрессия.

Классы — `reference.incidentGroups` (105). Обучение: `ml.scripts.train_classifier` (96 карточек билетов +
синтетика `data/labeled/synthetic_groups.json` из строк классификатора) → артефакт `MODELS_DIR/ekp_group_lr.joblib`.
Метрики: `ml.scripts.eval_classifier` → `var/metrics.json` (раздел `classifier`).

Режимы `predict(text)` (по убыванию точности, выбирается автоматически):
- `lr` — артефакт обучен и эмбеддер доступен: уверенность = вероятность класса;
- `prototype` — артефакта нет: косинус к прототипу группы (среднее эмбеддингов её строк классификатора и
  карточек), уверенность = softmax косинусов с температурой 0,05;
- `lexical` — эмбеддера нет (FR-043): покрытие основ слов прототипа, уверенность = доля совпавших основ.
Бюджет: артефакт < 1 МБ, отклик < 30 мс на CPU после загрузки.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from ml.nlp import embedder
from ml.nlp.semantic import stems

ARTIFACT_NAME = "ekp_group_lr.joblib"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SYNTHETIC_FILE = DATA_DIR / "labeled" / "synthetic_groups.json"
PROTOTYPE_TEMPERATURE = 0.05
TOP_K = 3
CONFIDENCE_MIN = 0.6  # ниже — «требует ручной проверки» (R22)

_lock = threading.Lock()
_artifact: dict[str, Any] | None = None
_artifact_failed = False


def _seed_root() -> Path:
    from app.config import get_settings

    return get_settings().seed_dir / "spec" / "mocks"


def artifact_path() -> Path:
    from app.config import get_settings

    return get_settings().models_dir / ARTIFACT_NAME


def _read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def groups() -> tuple[str, ...]:
    path = _seed_root() / "reference.json"
    if not path.exists():
        return ()
    return tuple(str(g) for g in _read_json(path).get("incidentGroups", []))


@lru_cache(maxsize=1)
def classifier_entries() -> tuple[dict[str, Any], ...]:
    path = _seed_root() / "classifier.json"
    if not path.exists():
        return ()
    return tuple(_read_json(path).get("entries", []))


@lru_cache(maxsize=1)
def training_cards() -> tuple[dict[str, Any], ...]:
    path = _seed_root() / "cards.json"
    if not path.exists():
        return ()
    return tuple(_read_json(path).get("cards", []))


def entry_text(entry: dict[str, Any]) -> str:
    """Текст строки классификатора как «фабула»: итоговый тип + признаки опросной карты."""
    parts = [entry.get("finalType") or "", entry.get("sign1") or "", entry.get("sign2") or "", entry.get("sign3") or "", entry.get("extraSigns") or ""]
    return ", ".join(p.strip() for p in parts if p and p.strip())


def group_texts() -> dict[str, list[str]]:
    """Тексты-прототипы по группам: имя группы, строки классификатора, фабулы карточек."""
    texts: dict[str, list[str]] = {g: [g] for g in groups()}
    for entry in classifier_entries():
        texts.setdefault(str(entry.get("group")), []).append(entry_text(entry))
    for card in training_cards():
        texts.setdefault(str(card.get("group")), []).append(str(card.get("summary") or ""))
    return {g: [t for t in dict.fromkeys(items) if t] for g, items in texts.items()}


@dataclass(frozen=True)
class Prediction:
    group: str
    confidence: float
    top: list[tuple[str, float]]
    mode: str  # lr | prototype | lexical
    available: bool  # True — эмбеддинги использованы

    @property
    def confident(self) -> bool:
        return self.confidence >= CONFIDENCE_MIN

    def rank_of(self, group: str) -> int | None:
        for index, (candidate, _) in enumerate(self.top):
            if candidate == group:
                return index
        return None


def reset() -> None:
    """Для тестов и переобучения: сбросить артефакт и кэши."""
    global _artifact, _artifact_failed
    with _lock:
        _artifact = None
        _artifact_failed = False
    _prototypes.cache_clear()
    _lexical_prototypes.cache_clear()


def _load_artifact() -> dict[str, Any] | None:
    global _artifact, _artifact_failed
    if _artifact is not None or _artifact_failed:
        return _artifact
    with _lock:
        if _artifact is not None or _artifact_failed:
            return _artifact
        path = artifact_path()
        if not path.exists():
            _artifact_failed = True
            return None
        try:
            import joblib

            loaded = joblib.load(path)
            if not isinstance(loaded, dict) or "model" not in loaded or "classes" not in loaded:
                raise ValueError("неожиданный формат артефакта")
            _artifact = loaded
        except Exception:  # noqa: BLE001 — битый артефакт → прототипы
            _artifact_failed = True
            return None
        return _artifact


def mode() -> str:
    if not embedder.available():
        return "lexical"
    return "lr" if _load_artifact() is not None else "prototype"


@lru_cache(maxsize=1)
def _prototypes() -> tuple[list[str], np.ndarray] | None:
    texts = group_texts()
    names = [g for g, items in texts.items() if items]
    flat = [t for g in names for t in texts[g]]
    vectors = embedder.encode(flat)
    if vectors is None:
        return None
    matrix = np.zeros((len(names), vectors.shape[1]), dtype=np.float32)
    offset = 0
    for row, name in enumerate(names):
        count = len(texts[name])
        mean = vectors[offset : offset + count].mean(axis=0)
        matrix[row] = mean / (np.linalg.norm(mean) or 1.0)
        offset += count
    return names, matrix


@lru_cache(maxsize=1)
def _lexical_prototypes() -> dict[str, set[str]]:
    return {g: {s for t in items for s in stems(t)} for g, items in group_texts().items()}


def _top(names: list[str], scores: np.ndarray, k: int) -> list[tuple[str, float]]:
    order = np.argsort(-scores)[:k]
    return [(names[i], float(scores[i])) for i in order]


def _predict_lr(text: str, artifact: dict[str, Any], k: int) -> Prediction | None:
    vectors = embedder.encode([text])
    if vectors is None:
        return None
    proba = artifact["model"].predict_proba(vectors)[0]
    classes = [str(c) for c in artifact["classes"]]
    top = _top(classes, np.asarray(proba, dtype=np.float32), k)
    return Prediction(group=top[0][0], confidence=top[0][1], top=top, mode="lr", available=True)


def _predict_prototype(text: str, k: int) -> Prediction | None:
    prototypes = _prototypes()
    if prototypes is None:
        return None
    names, matrix = prototypes
    vector = embedder.encode([text])
    if vector is None:
        return None
    cosines = matrix @ vector[0]
    logits = cosines / PROTOTYPE_TEMPERATURE
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    top = _top(names, probs, k)
    return Prediction(group=top[0][0], confidence=top[0][1], top=top, mode="prototype", available=True)


def _predict_lexical(text: str, k: int) -> Prediction:
    query = set(stems(text))
    names = list(_lexical_prototypes().keys())
    scores = np.zeros(len(names), dtype=np.float32)
    if query:
        for row, name in enumerate(names):
            proto = _lexical_prototypes()[name]
            scores[row] = len(query & proto) / len(query)
    top = _top(names, scores, k) if names else [("", 0.0)]
    return Prediction(group=top[0][0], confidence=top[0][1], top=top, mode="lexical", available=False)


def predict(text: str, k: int = TOP_K) -> Prediction:
    """Группа ЕКП и уверенность (0..1) для текста фабулы; `top` — k лучших кандидатов."""
    text = (text or "").strip()
    if not text:
        return Prediction(group="", confidence=0.0, top=[], mode=mode(), available=embedder.available())
    artifact = _load_artifact()
    if artifact is not None:
        result = _predict_lr(text, artifact, k)
        if result is not None:
            return result
    result = _predict_prototype(text, k)
    if result is not None:
        return result
    return _predict_lexical(text, k)


def synthetic_samples() -> list[dict[str, str]]:
    """Синтетика для обучения (`build_synthetic_groups.py`): [{ text, group }]."""
    if not SYNTHETIC_FILE.exists():
        return []
    return [s for s in _read_json(SYNTHETIC_FILE).get("samples", []) if s.get("text") and s.get("group")]
