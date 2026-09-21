"""Метрики классификатора групп ЕКП (SC-006: accuracy ≥ 0,8 на 96 задачах билетов) → `var/metrics.json` (раздел `classifier`).

Считаются два числа: `accuracy` — текущий артефакт на 96 карточках (они входят в обучение, оценка оптимистичная)
и `cvAccuracy` — 5-блочная кросс-валидация по карточкам (синтетика всегда в обучении, карточки блока — только
в проверке; честная оценка обобщения на новые фабулы). Плюс top-3 accuracy, доля уверенных (≥ 0,6) и матрица
ошибок в виде списка перепутанных пар. Запуск: `uv run python -m ml.scripts.eval_classifier`.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from typing import Any

import numpy as np

from ml.classify import ekp_group_classifier as clf
from ml.nlp import embedder
from ml.scripts.eval_assessor import write_metrics
from ml.scripts.train_classifier import fit, training_samples

ACCURACY_MIN = 0.8
FOLDS = 5


def _predict_with(artifact: dict[str, Any], vectors: np.ndarray) -> list[list[str]]:
    proba = artifact["model"].predict_proba(vectors)
    classes = [str(c) for c in artifact["classes"]]
    return [[classes[i] for i in np.argsort(-row)[:3]] for row in proba]


def evaluate() -> dict[str, Any]:
    cards = [c for c in clf.training_cards() if c.get("summary") and c.get("group")]
    texts = [str(c["summary"]) for c in cards]
    labels = [str(c["group"]) for c in cards]
    started = time.perf_counter()
    predictions = [clf.predict(t) for t in texts]
    seconds = (time.perf_counter() - started) / max(len(texts), 1)
    hits = [p.group == label for p, label in zip(predictions, labels, strict=True)]
    top3 = [p.rank_of(label) is not None for p, label in zip(predictions, labels, strict=True)]
    confident = [p.confident for p in predictions]
    confusion = Counter((label, p.group) for p, label in zip(predictions, labels, strict=True) if p.group != label)

    cv_hits: list[bool] = []
    if embedder.available():
        card_vectors = embedder.encode(texts)
        order = np.arange(len(cards))
        for fold in range(FOLDS):
            test_idx = order[fold::FOLDS]
            excluded = {cards[i]["id"] for i in test_idx}
            samples = training_samples(exclude_card_ids=excluded)
            artifact = fit(samples)
            predicted = _predict_with(artifact, card_vectors[test_idx])
            cv_hits.extend(predicted[j][0] == labels[i] for j, i in enumerate(test_idx))

    metrics: dict[str, Any] = {
        "samples": len(cards),
        "classes": len(clf.groups()),
        "mode": predictions[0].mode if predictions else clf.mode(),
        "accuracy": round(sum(hits) / max(len(hits), 1), 4),
        "top3Accuracy": round(sum(top3) / max(len(top3), 1), 4),
        "confidentShare": round(sum(confident) / max(len(confident), 1), 4),
        "cvAccuracy": round(sum(cv_hits) / len(cv_hits), 4) if cv_hits else None,
        "cvFolds": FOLDS if cv_hits else 0,
        "secondsPerText": round(seconds, 4),
        "confusion": [{"expected": e, "predicted": p, "count": n} for (e, p), n in confusion.most_common(20)],
    }
    metrics["passed"] = metrics["accuracy"] >= ACCURACY_MIN
    return metrics


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Метрики классификатора групп ЕКП")
    parser.parse_args(argv)
    metrics = evaluate()
    path = write_metrics("classifier", metrics)
    print(f"mode={metrics['mode']} accuracy={metrics['accuracy']} top3={metrics['top3Accuracy']} cv={metrics['cvAccuracy']} confident={metrics['confidentShare']} sec/text={metrics['secondsPerText']}")
    for row in metrics["confusion"][:10]:
        print(f"  {row['expected']} → {row['predicted']} ×{row['count']}")
    print(f"→ {path} ({'PASS' if metrics['passed'] else 'FAIL'}: accuracy ≥ {ACCURACY_MIN})")
    return 0 if metrics["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
