"""Метрики оценщика режима B на размеченной выборке (принцип III): `uv run python -m ml.scripts.eval_assessor`.

Считает по `backend/data/labeled/attempts/*.json`:
- согласие по типам ошибок — доля совпадений «есть/нет» по словарю типов разметки (accuracy) и каппа Коэна;
- корреляцию Пирсона и Спирмена между totalScore оценщика и expertScore;
- MAE по баллу; список расхождений для разбора.
Результат — `backend/var/metrics.json` (раздел `assessor`). Пороги приёмки: согласие ≥ 0,85, корреляция ≥ 0,8.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.config import get_settings
from ml.assess import adapter, engine

LABELED_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "attempts"
AGREEMENT_MIN = 0.85
CORRELATION_MIN = 0.80


def load_samples(directory: Path = LABELED_DIR) -> list[dict[str, Any]]:
    samples = []
    for path in sorted(directory.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            samples.append(json.load(handle))
    return samples


def reference() -> dict[str, Any]:
    path = get_settings().seed_dir / "spec" / "mocks" / "reference.json"
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def cohen_kappa(expected: np.ndarray, found: np.ndarray) -> float:
    total = expected.size
    if total == 0:
        return 0.0
    po = float((expected == found).mean())
    p_yes = float(expected.mean()) * float(found.mean())
    p_no = (1 - float(expected.mean())) * (1 - float(found.mean()))
    pe = p_yes + p_no
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    def ranks(values: np.ndarray) -> np.ndarray:
        order = values.argsort(kind="stable")
        result = np.empty(len(values), dtype=float)
        result[order] = np.arange(len(values), dtype=float)
        # средние ранги для повторов
        unique, inverse = np.unique(values, return_inverse=True)
        for idx in range(len(unique)):
            mask = inverse == idx
            result[mask] = result[mask].mean()
        return result

    return pearson(ranks(a), ranks(b))


def pearson(a: np.ndarray, b: np.ndarray) -> float:
    if a.std() == 0 or b.std() == 0:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def evaluate(samples: list[dict[str, Any]], weights: dict[str, float] | None = None) -> dict[str, Any]:
    ref = reference()
    vocabulary = sorted({t for s in samples for t in s["expectedErrors"]})
    expected_matrix, found_matrix = [], []
    expert, predicted = [], []
    mismatches = []
    started = time.perf_counter()
    for doc in samples:
        cards = {doc["card"]["id"]: doc["card"]}
        result = engine.assess(doc["attempt"], doc["scenario"], cards, ref, weights=weights, session=doc.get("session"))
        evaluation = adapter.to_evaluation(result)
        found_types = {e["type"] for e in evaluation["errors"]}
        expected_types = set(doc["expectedErrors"])
        expected_matrix.append([1 if t in expected_types else 0 for t in vocabulary])
        found_matrix.append([1 if t in found_types else 0 for t in vocabulary])
        expert.append(doc["expertScore"])
        predicted.append(evaluation["totalScore"])
        missed = sorted(expected_types - found_types)
        extra = sorted((found_types & set(vocabulary)) - expected_types)
        if missed or extra or abs(doc["expertScore"] - evaluation["totalScore"]) > 25:
            mismatches.append({"id": doc["id"], "name": doc.get("name"), "missed": missed, "extra": extra, "expert": doc["expertScore"], "predicted": evaluation["totalScore"], "grammar": len(evaluation["grammarErrors"])})
    elapsed = time.perf_counter() - started
    exp = np.array(expected_matrix, dtype=int)
    fnd = np.array(found_matrix, dtype=int)
    expert_arr = np.array(expert, dtype=float)
    predicted_arr = np.array(predicted, dtype=float)
    per_type = {}
    for idx, name in enumerate(vocabulary):
        tp = int(((exp[:, idx] == 1) & (fnd[:, idx] == 1)).sum())
        fp = int(((exp[:, idx] == 0) & (fnd[:, idx] == 1)).sum())
        fn = int(((exp[:, idx] == 1) & (fnd[:, idx] == 0)).sum())
        precision = tp / (tp + fp) if tp + fp else 1.0
        recall = tp / (tp + fn) if tp + fn else 1.0
        per_type[name] = {"tp": tp, "fp": fp, "fn": fn, "precision": round(precision, 3), "recall": round(recall, 3)}
    return {
        "samples": len(samples),
        "assessorVersion": engine.ASSESSOR_VERSION,
        "typeVocabulary": vocabulary,
        "agreement": round(float((exp == fnd).mean()), 4) if exp.size else 0.0,
        "kappa": round(cohen_kappa(exp.flatten(), fnd.flatten()), 4) if exp.size else 0.0,
        "pearson": round(pearson(expert_arr, predicted_arr), 4),
        "spearman": round(spearman(expert_arr, predicted_arr), 4),
        "mae": round(float(np.abs(expert_arr - predicted_arr).mean()), 2),
        "perType": per_type,
        "mismatches": mismatches,
        "secondsPerAttempt": round(elapsed / max(1, len(samples)), 3),
        "passed": bool(exp.size) and float((exp == fnd).mean()) >= AGREEMENT_MIN and pearson(expert_arr, predicted_arr) >= CORRELATION_MIN,
    }


def write_metrics(section: str, payload: dict[str, Any]) -> Path:
    path = get_settings().var_dir / "metrics.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    if path.exists():
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
    data[section] = payload
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Метрики оценщика на размеченной выборке")
    parser.add_argument("--dir", type=Path, default=LABELED_DIR)
    parser.add_argument("--weights", type=Path, default=None, help="JSON с весами компонентов (например, из calibrate.py)")
    args = parser.parse_args(argv)
    weights = json.loads(args.weights.read_text(encoding="utf-8")) if args.weights else None
    metrics = evaluate(load_samples(args.dir), weights)
    path = write_metrics("assessor", metrics)
    print(f"samples={metrics['samples']} agreement={metrics['agreement']} kappa={metrics['kappa']} pearson={metrics['pearson']} spearman={metrics['spearman']} mae={metrics['mae']} sec/attempt={metrics['secondsPerAttempt']}")
    for row in metrics["mismatches"]:
        print(f"  {row['id']} {row['name']}: missed={row['missed']} extra={row['extra']} expert={row['expert']} predicted={row['predicted']}")
    print(f"→ {path} ({'PASS' if metrics['passed'] else 'FAIL'}: согласие ≥ {AGREEMENT_MIN}, корреляция ≥ {CORRELATION_MIN})")
    return 0 if metrics["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
