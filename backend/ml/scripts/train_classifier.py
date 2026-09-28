"""Обучение классификатора групп ЕКП (T059): rubert-tiny2 → LogisticRegression → `MODELS_DIR/ekp_group_lr.joblib`.

Обучающая выборка: фабулы 96 карточек `spec/000-фронт/mocks/cards.json` + синтетика `data/labeled/synthetic_groups.json`
(`build_synthetic_groups.py`). Классы — `reference.incidentGroups`; группы без примеров получают своё название
как единственный пример. Детерминировано (lbfgs), без сети; ~20 с на CPU.
Запуск: `uv run python -m ml.scripts.train_classifier [--exclude-cards]` (`--exclude-cards` — для кросс-валидации).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from ml.classify import ekp_group_classifier as clf
from ml.nlp import embedder

VERSION = "ekp-lr-1.0.0"
# Подобрано на 5-блочной кросс-валидации по карточкам (2026-09-21): C=20, вес карточки 5 против синтетики 1 —
# лучшая cv-accuracy (0,57) при уверенности ≥ 0,6 на половине новых фабул; balanced-веса ухудшают обе метрики.
REGULARIZATION_C = 20.0
CARD_WEIGHT = 5.0
MAX_ITER = 3000


def training_samples(include_cards: bool = True, exclude_card_ids: set[str] | None = None) -> list[tuple[str, str, float]]:
    """(текст, группа, вес): синтетика с весом 1, фабулы карточек — CARD_WEIGHT, группы без примеров — их имя."""
    samples: list[tuple[str, str, float]] = [(s["text"], s["group"], 1.0) for s in clf.synthetic_samples()]
    if include_cards:
        for card in clf.training_cards():
            if exclude_card_ids and card.get("id") in exclude_card_ids:
                continue
            samples.append((str(card.get("summary") or ""), str(card.get("group") or ""), CARD_WEIGHT))
    known = set(clf.groups())
    covered = {group for _, group, _ in samples}
    for group in known - covered:
        samples.append((group, group, 1.0))
    return [(t, g, w) for t, g, w in samples if t.strip() and g in known]


def fit(samples: list[tuple[str, str, float]], vectors: np.ndarray | None = None) -> dict[str, Any]:
    from sklearn.linear_model import LogisticRegression

    texts = [t for t, _, _ in samples]
    labels = [g for _, g, _ in samples]
    weights = np.asarray([w for _, _, w in samples], dtype=np.float32)
    if vectors is None:
        vectors = embedder.encode(texts)
    if vectors is None:
        raise RuntimeError(embedder.unavailable_reason() or "эмбеддер недоступен")
    model = LogisticRegression(C=REGULARIZATION_C, max_iter=MAX_ITER)
    model.fit(vectors, labels, sample_weight=weights)
    return {"model": model, "classes": [str(c) for c in model.classes_], "version": VERSION, "embedder": embedder.MODEL_DIR_NAME, "samples": len(samples)}


def save(artifact: dict[str, Any], path: Path | None = None) -> Path:
    import joblib

    target = path or clf.artifact_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, target, compress=3)
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Обучение классификатора групп ЕКП")
    parser.add_argument("--exclude-cards", action="store_true", help="не включать 96 карточек (для честной оценки)")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)
    if not embedder.available():
        print(embedder.unavailable_reason(), file=sys.stderr)
        return 1
    started = time.perf_counter()
    samples = training_samples(include_cards=not args.exclude_cards)
    artifact = fit(samples)
    path = save(artifact, args.out)
    clf.reset()
    size = path.stat().st_size / 1_048_576
    print(f"{path}: {artifact['samples']} примеров, {len(artifact['classes'])} классов, {size:.2f} МБ, {time.perf_counter() - started:.1f} с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
