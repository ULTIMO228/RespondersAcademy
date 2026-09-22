"""SC-005: 20 корректных + 20 дефектных билетов → var/metrics.json.

Размеченные билеты происходят из обучающего банка: это регрессионная проверка,
а не независимая оценка обобщения. Ручная проверка учитывается отдельно.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from ml.classify import ekp_group_classifier as classifier
from ml.generate import validator
from ml.scripts.eval_assessor import write_metrics

TICKETS_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "tickets"


def evaluate() -> dict[str, Any]:
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(TICKETS_DIR.glob("tk-*.json"))]
    correct = [d for d in docs if d["kind"] == "correct"]
    defective = [d for d in docs if d["kind"] == "defective"]
    if len(correct) != 20 or len(defective) != 20 or len(docs) != 40:
        raise ValueError("SC-005 требует ровно 20 корректных и 20 дефектных билетов")
    bank = classifier.training_cards()
    rows = []
    for doc in docs:
        report = validator.validate(doc["ticket"], [c for c in bank if c["id"] != doc["sourceCardId"]])
        rows.append({"id": doc["id"], "kind": doc["kind"], "expectedFailed": doc["expectedFailed"], **report.to_contract()})
    accepted = sum(r["passed"] for r in rows if r["kind"] == "correct") / 20
    rejected = sum(not r["passed"] for r in rows if r["kind"] == "defective") / 20
    unavailable = sum(any(not c["available"] for c in r["checks"]) for r in rows)
    return {
        "version": validator.VALIDATOR_VERSION, "correctCount": 20, "defectiveCount": 20,
        "correctPassRate": accepted, "defectiveRejectRate": rejected,
        "needsReviewCount": sum(r["needsReview"] for r in rows), "unavailableCount": unavailable,
        "passed": accepted >= 0.85 and rejected >= 0.9 and unavailable == 0,
        "dataset": "seed-derived regression; not a held-out evaluation", "results": rows,
    }


def main() -> int:
    metrics = evaluate()
    path = write_metrics("validator", metrics)
    print(f"correct={metrics['correctPassRate']:.0%} defective={metrics['defectiveRejectRate']:.0%} review={metrics['needsReviewCount']} unavailable={metrics['unavailableCount']}")
    print(f"{path}: {'PASS' if metrics['passed'] else 'FAIL'}")
    return 0 if metrics["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
