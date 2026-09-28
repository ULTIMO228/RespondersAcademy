"""Материалы для смыслового разбора: плотный листинг для Claude и выборка для человека.

    uv run python -m ml.dataset.review listing --dir data/ai_dataset/v1 --prefix batch-tra-01
    uv run python -m ml.dataset.review human-sample --dir data/ai_dataset/v1 --share 0.08
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

from ml.dataset.validate import load_completions, load_jsonl


def _load(root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, Any]]:
    cases = {c["caseId"]: c for c in load_jsonl(root / "seeds" / "cases.jsonl")}
    completions, _errors = load_completions(root)
    report_path = root / "reports" / "validation.json"
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {"results": {}}
    return cases, completions, report


def format_case(case: dict[str, Any], completion: dict[str, Any], flags: list[str]) -> str:
    target = case["target"]
    ids = {f["id"]: f"F{n + 1}" for n, f in enumerate(case["referenceFacts"])}
    facts = " | ".join(f"{ids[f['id']]}{'✗' if f['id'] in target['missingFactIds'] else ''}: {f['text']}" for f in case["referenceFacts"])
    recipe = case["recipe"]
    head = f"{case['caseId']} [{case['field']}] {target['decision']}/{recipe['perturbation']}{' +INJ' if recipe['injection'] else ''}"
    lines = [head, f"  факты: {facts or '(пусто)'}"]
    if recipe.get("foreignFacts"):
        lines.append(f"  чужая ситуация: {' | '.join(recipe['foreignFacts'])}")
    lines.append(f"  текст: {completion['studentText']}")
    lines.append(f"  объяснение: {completion['explanation']}")
    if flags:
        lines.append(f"  ⚑ {'; '.join(flags)}")
    return "\n".join(lines)


def listing(root: Path, prefix: str | None) -> str:
    cases, completions, report = _load(root)
    wanted: set[str] | None = None
    if prefix:
        batch = json.loads((root / "batches" / f"{prefix}.json").read_text(encoding="utf-8"))
        wanted = {c["caseId"] for c in batch}
    blocks = []
    for cid, completion in completions.items():
        if wanted is not None and cid not in wanted:
            continue
        result = report["results"].get(cid, {"errors": [], "flags": []})
        if result["errors"]:
            continue
        blocks.append(format_case(cases[cid], completion, result["flags"]))
    return "\n".join(blocks)


def record(root: Path, batch: str, reject: dict[str, str], fix: dict[str, dict[str, str]]) -> dict[str, int]:
    """Фиксирует вердикты разбора по пакету: непрочитанные валидатором не трогаются, остальные — accept, кроме `reject`.

    Вызывается только после чтения листинга пакета: явный список отклонённых и правок — результат разбора.
    """
    cases, completions, report = _load(root)
    ids = [c["caseId"] for c in json.loads((root / "batches" / f"{batch}.json").read_text(encoding="utf-8"))]
    path = root / "reviews" / "claude-review.jsonl"
    existing = {r["caseId"]: r for r in load_jsonl(path)} if path.exists() else {}
    counts = {"accept": 0, "reject": 0}
    for cid in ids:
        if cid not in completions:
            continue
        failed = bool(report["results"].get(cid, {}).get("errors"))
        if failed or cid in reject:
            note = reject.get(cid) or "; ".join(report["results"][cid]["errors"])
            existing[cid] = {"caseId": cid, "verdict": "reject", "note": note}
            counts["reject"] += 1
        else:
            entry: dict[str, Any] = {"caseId": cid, "verdict": "accept"}
            if cid in fix:
                entry["fix"] = fix[cid]
            existing[cid] = entry
            counts["accept"] += 1
    unknown = (set(reject) | set(fix)) - set(ids)
    if unknown:
        raise SystemExit(f"вердикты для чужих случаев: {sorted(unknown)}")
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in existing.values()), encoding="utf-8")
    return counts


def human_sample(root: Path, share: float, seed: int = 112) -> Path:
    """Стратифицированная по вердикту выборка принятых Claude примеров для просмотра человеком + все инъекции ≤ 6 шт."""
    cases, completions, _report = _load(root)
    reviews = {r["caseId"]: r for r in load_jsonl(root / "reviews" / "claude-review.jsonl")}
    accepted = [c for c, r in reviews.items() if r.get("verdict") == "accept" and c in completions]
    rng = random.Random(seed)
    picked: list[str] = []
    for decision in ("equivalent", "different", "uncertain"):
        pool = sorted(c for c in accepted if cases[c]["target"]["decision"] == decision)
        picked.extend(rng.sample(pool, k=max(1, round(len(pool) * share))) if pool else [])
    injections = [c for c in accepted if cases[c]["recipe"]["injection"] and c not in picked]
    picked.extend(rng.sample(injections, k=min(6, len(injections))))
    lines = [
        "# Выборка для просмотра человеком",
        "",
        f"Примеров: {len(picked)} из {len(accepted)} принятых. Отметьте отклонённые в `reviews/human-review.jsonl`",
        '(`{"caseId":"sr-0001","verdict":"reject","note":"…"}`; принятые записывать не нужно).',
        "",
    ]
    for cid in sorted(picked):
        lines.append("```")
        lines.append(format_case(cases[cid], completions[cid], []))
        lines.append("```")
    path = root / "reviews" / "human-sample.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["listing", "human-sample", "record"])
    parser.add_argument("--spec", help="record: JSON {batch,reject:{id:note},fix:{id:{studentText?,explanation?}}}")
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--prefix")
    parser.add_argument("--share", type=float, default=0.08)
    args = parser.parse_args()
    if args.command == "record":
        spec = json.loads(args.spec)
        print(record(args.dir, spec["batch"], spec.get("reject", {}), spec.get("fix", {})))
    elif args.command == "listing":
        print(listing(args.dir, args.prefix))
    else:
        print(human_sample(args.dir, args.share))


if __name__ == "__main__":
    main()
