"""Калибровка весов оценщика (R9, принцип II/III): ridge-регрессия балла по компонентам.

Вход: размеченная выборка `backend/data/labeled/attempts/*.json` (expertScore) и, при `--db`, правки
преподавателей из `calibration_samples` (payload.score + payload.components). Выход — веса компонентов
(нормированные, ≥ 0) в `backend/var/weights.json` и метрики до/после в `backend/var/metrics.json`.

Запуск: `uv run python -m ml.scripts.calibrate [--db] [--alpha 1.0]`. Веса применяются явно:
`eval_assessor --weights var/weights.json`; в рантайме — через `plan.weights` занятия или конфиг.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

from app.config import get_settings
from ml.assess import engine
from ml.assess.types import DEFAULT_WEIGHTS_DDS
from ml.scripts.eval_assessor import evaluate, load_samples, reference, write_metrics

COMPONENT_NAMES = list(DEFAULT_WEIGHTS_DDS)


def component_matrix(samples: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    ref = reference()
    rows, targets = [], []
    for doc in samples:
        result = engine.assess(doc["attempt"], doc["scenario"], {doc["card"]["id"]: doc["card"]}, ref, session=doc.get("session"))
        rows.append([result.components[name].score if result.components[name].applicable else 1.0 for name in COMPONENT_NAMES])
        targets.append(doc["expertScore"] / 100)
    return np.array(rows, dtype=float), np.array(targets, dtype=float)


async def override_samples() -> list[dict[str, Any]]:
    """Правки преподавателей как примеры: components из payload, целевой балл — оценка преподавателя."""
    from sqlalchemy import select

    from app.db.session import get_sessionmaker
    from app.models.report import CalibrationSample

    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(CalibrationSample))).scalars().all()
    samples = []
    for row in rows:
        components = (row.payload or {}).get("components") or {}
        if not components or "score" not in (row.payload or {}):
            continue
        samples.append({"components": components, "score": row.payload["score"] / 100})
    return samples


def ridge(matrix: np.ndarray, target: np.ndarray, alpha: float) -> np.ndarray:
    """Неотрицательные веса без свободного члена: ridge + проекция на ≥ 0, нормировка на сумму 1."""
    identity = np.eye(matrix.shape[1])
    weights = np.linalg.solve(matrix.T @ matrix + alpha * identity, matrix.T @ target)
    weights = np.clip(weights, 0.0, None)
    total = weights.sum()
    return weights / total if total > 0 else np.array([DEFAULT_WEIGHTS_DDS[n] for n in COMPONENT_NAMES])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Калибровка весов оценщика")
    parser.add_argument("--alpha", type=float, default=1.0)
    parser.add_argument("--db", action="store_true", help="добавить правки преподавателей из calibration_samples")
    parser.add_argument("--output", type=Path, default=get_settings().var_dir / "weights.json")
    args = parser.parse_args(argv)
    samples = load_samples()
    matrix, target = component_matrix(samples)
    if args.db:
        extra = asyncio.run(override_samples())
        for item in extra:
            matrix = np.vstack([matrix, [float(item["components"].get(n, {}).get("score", 1.0)) for n in COMPONENT_NAMES]])
            target = np.append(target, item["score"])
        print(f"правок преподавателей: {len(extra)}")
    weights = ridge(matrix, target, args.alpha)
    calibrated = {name: round(float(value), 4) for name, value in zip(COMPONENT_NAMES, weights, strict=True)}
    before = evaluate(samples)
    after = evaluate(samples, calibrated)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(calibrated, ensure_ascii=False, indent=1), encoding="utf-8")
    write_metrics("calibration", {"alpha": args.alpha, "samples": int(matrix.shape[0]), "weights": calibrated, "before": {k: before[k] for k in ("pearson", "spearman", "mae")}, "after": {k: after[k] for k in ("pearson", "spearman", "mae")}})
    print("веса:", calibrated)
    print(f"до: pearson={before['pearson']} mae={before['mae']}; после: pearson={after['pearson']} mae={after['mae']} → {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
