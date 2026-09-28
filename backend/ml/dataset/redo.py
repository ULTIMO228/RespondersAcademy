"""Второй и последующие проходы: перегенерация отклонённых разбором случаев.

Отклонённые выполнения уходят в архив `rejected/round<N>.jsonl` (с причиной), в `completions/` они больше не
читаются. Для `swapIncident` подсказка `recipe.foreignFacts` пересобирается так, чтобы ни один её факт не совпадал
с фактами эталона (иначе агент повторяет факт эталона и метка «не передано ничего» становится неверной).

    uv run python -m ml.dataset.redo --dir data/ai_dataset/v1 --round 2 [--splits train,validation]
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

from ml.dataset import identities, plan
from ml.dataset.validate import load_jsonl


def fresh_foreign_facts(case: dict[str, Any], pool: dict[str, dict[str, list[dict[str, str]]]]) -> list[str]:
    """Факты чужой ситуации того же поля, не пересекающиеся по тексту с эталоном (и без «сообщение принято»)."""
    own = {f["text"] for f in case["referenceFacts"]}
    rng = random.Random(f"foreign|{case['caseId']}")
    candidates = sorted(c for c in pool if c != case["cardId"] and case["field"] in pool[c])
    rng.shuffle(candidates)
    for card_id in candidates:
        texts = [f["text"] for f in pool[card_id][case["field"]] if f["text"] != "сообщение принято"]
        if texts and not own & set(texts):
            return texts
    raise SystemExit(f"нет чужой ситуации для {case['caseId']}")


def build_redo(root: Path, round_no: int, splits: set[str], batch_size: int = 25) -> dict[str, Any]:
    cases = {c["caseId"]: c for c in load_jsonl(root / "seeds" / "cases.jsonl")}
    reviews = {r["caseId"]: r for r in load_jsonl(root / "reviews" / "claude-review.jsonl")}
    done: set[str] = set()
    for path in (root / "completions").glob("*.jsonl"):
        done.update(r["caseId"] for r in load_jsonl(path) if "caseId" in r)

    report_path = root / "reports" / "validation.json"
    failed = set(json.loads(report_path.read_text(encoding="utf-8"))["failedIds"]) if report_path.exists() else set()
    redo_ids = sorted(
        cid for cid, case in cases.items()
        if case["split"] in splits and (reviews.get(cid, {}).get("verdict") == "reject" or cid not in done or cid in failed)
    )

    # Архив отклонённых выполнений и удаление их из рабочих файлов.
    rejected_dir = root / "rejected"
    rejected_dir.mkdir(exist_ok=True)
    archive: list[str] = []
    for path in sorted((root / "completions").glob("*.jsonl")):
        keep: list[str] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("caseId") in redo_ids:
                note = reviews.get(row["caseId"], {}).get("note", "") or "не прошёл детерминированную проверку"
                archive.append(json.dumps({**row, "note": note}, ensure_ascii=False))
            else:
                keep.append(line)
        path.write_text("".join(x + "\n" for x in keep), encoding="utf-8")
    if archive:
        with (rejected_dir / f"round{round_no - 1}.jsonl").open("a", encoding="utf-8") as handle:
            handle.write("\n".join(archive) + "\n")

    # Пересборка подсказок swapIncident для перегенерируемых случаев.
    cards = {c["id"]: c for c in plan.load_cards()}
    pool = {
        cid: plan._fields_for(card, identities.scrub_text(card["summary"], cid), f"ticket-{card['ticketNo']:03d}")
        for cid, card in cards.items()
    }
    patched = 0
    for cid in redo_ids:
        case = cases[cid]
        if case["recipe"]["perturbation"] == "swapIncident":
            case["recipe"]["foreignFacts"] = fresh_foreign_facts(case, pool)
            patched += 1
    with (root / "seeds" / "cases.jsonl").open("w", encoding="utf-8") as handle:
        for case in cases.values():
            handle.write(json.dumps(case, ensure_ascii=False) + "\n")

    for stale in (root / "batches").glob(f"redo{round_no}-*.json"):
        stale.unlink()
    names = []
    for n in range(0, len(redo_ids), batch_size):
        name = f"redo{round_no}-{n // batch_size + 1:02d}"
        (root / "batches" / f"{name}.json").write_text(
            json.dumps([cases[c] for c in redo_ids[n : n + batch_size]], ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
        names.append(name)
    return {"cases": len(redo_ids), "swapPatched": patched, "batches": names, "byDecision": _by(cases, redo_ids)}


def _by(cases: dict[str, Any], ids: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for cid in ids:
        key = cases[cid]["target"]["decision"]
        out[key] = out.get(key, 0) + 1
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--round", type=int, default=2)
    parser.add_argument("--splits", default="train,validation")
    args = parser.parse_args()
    print(json.dumps(build_redo(args.dir, args.round, set(args.splits.split(","))), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
