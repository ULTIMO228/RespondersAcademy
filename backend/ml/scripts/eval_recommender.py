"""SC-008: 10 воспроизводимых синтетических историй, худшая категория в топ-3."""

from __future__ import annotations

from ml.insights.recommender import weak_categories
from ml.scripts.eval_assessor import write_metrics

NOW = "2026-09-28T12:00:00+03:00"
GROUPS = ("Запах газа", "ДТП", "Пожар")


def evaluate() -> dict:
    cases = []
    for case_no in range(10):
        worst = GROUPS[case_no % len(GROUPS)]
        history = []
        for group in GROUPS:
            count = 6 if group == worst else 2
            for index in range(count):
                history.append({"group": group, "at": NOW, "mode": "dds" if index % 2 else "operator112",
                                "score": 45 if group == worst else 75,
                                "errors": [{"type": "wrongType" if group == worst else "missingSign",
                                            "ruleId": "ekp-v046"}]})
        ranked = weak_categories(history, NOW)
        top3 = [item["group"] for item in ranked[:3]]
        cases.append({"id": case_no + 1, "worstGroup": worst, "top3": top3,
                      "hit": worst in top3,
                      "hasReason": all(item["errorType"] and item["count"] > 0 for item in ranked[:3])})
    hit_rate = sum(item["hit"] for item in cases) / len(cases)
    return {"version": "recommender-1.0.0", "cases": len(cases), "top3HitRate": hit_rate,
            "allReasonsPresent": all(item["hasReason"] for item in cases),
            "passed": hit_rate == 1.0 and all(item["hasReason"] for item in cases), "results": cases}


def main() -> int:
    result = evaluate()
    path = write_metrics("recommender", result)
    print(f"SC-008: {result['top3HitRate']:.0%}, reasons={result['allReasonsPresent']}; {path}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
