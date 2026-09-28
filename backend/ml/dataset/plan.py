"""План датасета: «семена» (case specs) с заранее заданной истинной меткой.

Истинные `decision`, `referenceFactIds` и `missingFactIds` определяет ПЛАН, а не Haiku: агент только пишет текст
обучающегося по заданному рецепту и краткое объяснение. Так метка не зависит от качества генерации, а проверка
сводится к вопросу «реализует ли текст рецепт».

    uv run python -m ml.dataset.plan --total 800 --out data/ai_dataset/v1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.config import get_settings
from ml.dataset import facts as F
from ml.dataset import identities
from ml.source_gate import ApprovedSource, SourceGateError, approved_source

SEED = 112
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "data" / "ai_dataset" / "v1"
REGISTRY = Path(__file__).resolve().parents[2] / "data" / "ai_dataset" / "sanitized_tickets.json"

# Доли полей. Комментарий к отказу возможен лишь у карточек-дублей и переводов в другой регион.
FIELD_WEIGHTS = {"description": 0.45, "dispatcherAction": 0.25, "serviceReport": 0.20, "refusalComment": 0.10}
DECISION_WEIGHTS = {"equivalent": 0.40, "different": 0.40, "uncertain": 0.20}
SPLIT_TICKET_SHARE = {"holdout": 5, "validation": 5}  # остальные билеты — train

PERTURBATIONS = {
    "equivalent": {"paraphrase": 30, "colloquial": 20, "abbreviated": 20, "verbose": 15, "typos": 15},
    "different": {"omitOne": 35, "omitMany": 15, "contradict": 30, "swapIncident": 20},
    "uncertain": {"ambiguousText": 45, "offTopic": 25, "foreignFact": 15, "emptyReference": 15},
}
CONFIDENCE = {"equivalent": [0.95, 0.9, 0.85, 0.8], "different": [0.95, 0.9, 0.85, 0.8, 0.75], "uncertain": [0.0]}
INJECTION_SHARE = 0.06
VERIFIED = {"mode": {"operator112": ["answerTimeout", "phoneMatch"], "dds": ["timeReaction", "statuses"]}}
CALLER_MENTION_SHARE = 0.25
STYLE = ["официально-деловой", "сжатый, телеграфный", "разговорный", "подробный", "с канцеляризмами диспетчера"]


def _rng(*parts: object) -> random.Random:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _mocks_dir() -> Path:
    return get_settings().seed_dir / "spec" / "000-фронт" / "mocks"


def load_cards() -> list[dict[str, Any]]:
    return json.loads((_mocks_dir() / "cards.json").read_text(encoding="utf-8"))["cards"]


def load_approved(registry: Path = REGISTRY) -> dict[tuple[str, int], ApprovedSource]:
    """Утверждённые ситуации по (sourceTicketId, situationNo); неутверждённые в план не попадают."""
    approved: dict[tuple[str, int], ApprovedSource] = {}
    for record in json.loads(registry.read_text(encoding="utf-8")):
        try:
            source = approved_source(record)
        except SourceGateError:
            continue
        approved[(source.source_ticket_id, source.situation_no)] = source
    return approved


def assign_splits(cards: list[dict[str, Any]], seed: int = SEED) -> dict[str, str]:
    """Билет → train|validation|holdout. Билеты, связанные `duplicateOf`, всегда в одном разбиении (без утечки)."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_id = {c["id"]: c for c in cards}
    for card in cards:
        find(f"ticket-{card['ticketNo']:03d}")
        if card.get("duplicateOf") and card["duplicateOf"] in by_id:
            other = by_id[card["duplicateOf"]]
            parent[find(f"ticket-{card['ticketNo']:03d}")] = find(f"ticket-{other['ticketNo']:03d}")

    groups: dict[str, list[str]] = defaultdict(list)
    for ticket in sorted({f"ticket-{c['ticketNo']:03d}" for c in cards}):
        groups[find(ticket)].append(ticket)
    ordered = sorted(groups.values(), key=lambda g: hashlib.sha256(f"{seed}|{g[0]}".encode()).hexdigest())

    result: dict[str, str] = {}
    counts = {"holdout": 0, "validation": 0, "train": 0}
    for group in ordered:
        target = next((s for s in ("holdout", "validation") if counts[s] < SPLIT_TICKET_SHARE[s]), "train")
        for ticket in group:
            result[ticket] = target
        counts[target] += len(group)
    return result


def _weighted(rng: random.Random, weights: dict[str, int]) -> str:
    return rng.choices(list(weights), weights=list(weights.values()), k=1)[0]


def _fields_for(card: dict[str, Any], scrubbed_summary: str, ticket_id: str) -> dict[str, list[dict[str, str]]]:
    """Поля и факты, доступные для карточки. Дубль не отрабатывается: у него только описание и комментарий отказа."""
    out: dict[str, list[dict[str, str]]] = {
        "description": F.description_facts(card, scrubbed_summary, ticket_id),
    }
    if not card.get("duplicateOf"):
        out["dispatcherAction"] = F.action_facts(card, ticket_id)
        out["serviceReport"] = F.report_facts(card, scrubbed_summary, card["address"], ticket_id)
    refusal = F.refusal_facts(card, ticket_id)
    if refusal:
        out["refusalComment"] = refusal
    return out


def _allocate(total: int, situations: dict[str, list[str]], rng: random.Random) -> list[tuple[str, str]]:
    """(cardId, field) на каждый пример: поля по долям, ситуации внутри поля — по кругу для равномерного покрытия."""
    pairs: list[tuple[str, str]] = []
    for field, weight in FIELD_WEIGHTS.items():
        eligible = [cid for cid, fields in situations.items() if field in fields]
        if not eligible:
            continue
        rng.shuffle(eligible)
        want = round(total * weight)
        pairs.extend((eligible[i % len(eligible)], field) for i in range(want))
    return pairs


def _decision_cycle(count: int, rng: random.Random) -> list[str]:
    base: list[str] = []
    for decision, share in DECISION_WEIGHTS.items():
        base.extend([decision] * round(count * share))
    while len(base) < count:
        base.append("equivalent")
    base = base[:count]
    rng.shuffle(base)
    return base


def build_case(
    idx: int,
    split: str,
    card: dict[str, Any],
    source: ApprovedSource,
    field: str,
    fact_pool: dict[str, dict[str, list[dict[str, str]]]],
    decision: str,
    rng: random.Random,
) -> dict[str, Any]:
    ticket_id = source.source_ticket_id
    ref_facts = [dict(f) for f in fact_pool[card["id"]][field]]
    perturbation = _weighted(rng, PERTURBATIONS[decision])
    if perturbation == "omitMany" and len(ref_facts) < 3:
        perturbation = "omitOne"
    if perturbation == "omitOne" and len(ref_facts) < 2:
        perturbation = "contradict"

    present = [f["id"] for f in ref_facts]
    missing: list[str] = []
    extra: dict[str, Any] = {}
    if decision == "different":
        if perturbation == "omitOne":
            missing = [rng.choice(ref_facts)["id"]]
        elif perturbation == "omitMany":
            missing = [f["id"] for f in rng.sample(ref_facts, k=min(len(ref_facts) - 1, rng.choice([2, 2, 3])))]
        elif perturbation == "contradict":
            missing = [rng.choice(ref_facts)["id"]]
        else:  # swapIncident: текст про другое происшествие; все факты не покрыты
            missing = [f["id"] for f in ref_facts]
            foreign = rng.choice([c for c in fact_pool if c != card["id"] and field in fact_pool[c]])
            extra["foreignFacts"] = [f["text"] for f in fact_pool[foreign][field]]
        present = [i for i in present if i not in missing]
    elif decision == "uncertain":
        if perturbation == "foreignFact":
            foreign = rng.choice([c for c in fact_pool if c != card["id"] and field in fact_pool[c]])
            alien = dict(rng.choice(fact_pool[foreign][field]))
            alien["id"] = f"fact:{ticket_id}:{source.situation_no}:{F.FIELD_LETTER[field]}{len(ref_facts) + 1}"
            ref_facts.append(alien)
            rng.shuffle(ref_facts)
        elif perturbation == "emptyReference":
            ref_facts = []
        present = []

    injection = rng.random() < INJECTION_SHARE and perturbation not in ("offTopic", "emptyReference")
    mode = F.FIELD_MODE[field]
    verified = rng.choices(["none", "ok", "violation"], weights=[50, 35, 15], k=1)[0]
    applicant = None
    if mode == "operator112":
        person = identities.make_person(f"{card['id']}:applicant")
        applicant = {
            "name": person.full,
            "status": card["caller"]["status"],
            "mention": rng.random() < CALLER_MENTION_SHARE,
        }
    confidence = rng.choice(CONFIDENCE[decision])
    return {
        "caseId": f"sr-{idx:04d}",
        "split": split,
        "sourceTicketId": ticket_id,
        "situationNo": source.situation_no,
        "cardId": card["id"],
        "mode": mode,
        "field": field,
        "situation": source.sanitized_text,
        "applicant": applicant,
        "referenceFacts": ref_facts,
        "verifiedRules": (
            [{"rule": rng.choice(VERIFIED["mode"][mode]), "result": "ok" if verified == "ok" else "violation"}]
            if verified != "none"
            else []
        ),
        "target": {
            "decision": decision,
            "referenceFactIds": [f["id"] for f in ref_facts],
            "missingFactIds": missing,
            "presentFactIds": present,
            "confidence": confidence,
        },
        "recipe": {
            "perturbation": perturbation,
            "style": rng.choice(STYLE),
            "injection": injection,
            "injectionStyle": rng.randint(1, 6) if injection else None,
            **extra,
        },
    }


def build_plan(total: int, registry: Path = REGISTRY, seed: int = SEED) -> list[dict[str, Any]]:
    cards = load_cards()
    approved = load_approved(registry)
    splits = assign_splits(cards, seed)
    by_split: dict[str, list[dict[str, Any]]] = defaultdict(list)
    fact_pool: dict[str, dict[str, list[dict[str, str]]]] = {}
    sources: dict[str, ApprovedSource] = {}
    for card in cards:
        ticket_id = f"ticket-{card['ticketNo']:03d}"
        source = approved.get((ticket_id, card["situationNo"]))
        if source is None:
            continue
        sources[card["id"]] = source
        fact_pool[card["id"]] = _fields_for(card, identities.scrub_text(card["summary"], card["id"]), ticket_id)
        by_split[splits[ticket_id]].append(card)

    n_situations = sum(len(v) for v in by_split.values())
    cases: list[dict[str, Any]] = []
    for split in ("train", "validation", "holdout"):
        cards_in_split = by_split.get(split, [])
        if not cards_in_split:
            continue
        rng = _rng(seed, split)
        share = round(total * len(cards_in_split) / n_situations)
        pairs = _allocate(share, {c["id"]: fact_pool[c["id"]] for c in cards_in_split}, rng)
        decisions = _decision_cycle(len(pairs), rng)
        rng.shuffle(pairs)
        card_by_id = {c["id"]: c for c in cards_in_split}
        for (card_id, field), decision in zip(pairs, decisions, strict=True):
            cases.append(
                build_case(len(cases) + 1, split, card_by_id[card_id], sources[card_id], field, fact_pool, decision, rng)
            )
    return cases


def write_plan(cases: list[dict[str, Any]], out: Path, batch_size: int = 25) -> dict[str, Any]:
    out.mkdir(parents=True, exist_ok=True)
    (out / "seeds").mkdir(exist_ok=True)
    (out / "batches").mkdir(exist_ok=True)
    for stale in (out / "batches").glob("batch-*.json"):
        stale.unlink()
    with (out / "seeds" / "cases.jsonl").open("w", encoding="utf-8") as handle:
        for case in cases:
            handle.write(json.dumps(case, ensure_ascii=False) + "\n")
    # Holdout в пакеты для агентов идёт последним и отдельными файлами (генерируется после заморозки манифеста).
    batches: list[str] = []
    for split in ("train", "validation", "holdout"):
        part = [c for c in cases if c["split"] == split]
        for n in range(0, len(part), batch_size):
            name = f"batch-{split[:3]}-{n // batch_size + 1:02d}.json"
            (out / "batches" / name).write_text(
                json.dumps(part[n : n + batch_size], ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
            batches.append(name)
    summary = {
        "total": len(cases),
        "bySplit": _count(cases, lambda c: c["split"]),
        "byField": _count(cases, lambda c: c["field"]),
        "byDecision": _count(cases, lambda c: c["target"]["decision"]),
        "byPerturbation": _count(cases, lambda c: c["recipe"]["perturbation"]),
        "tickets": {s: sorted({c["sourceTicketId"] for c in cases if c["split"] == s}) for s in ("train", "validation", "holdout")},
        "batches": batches,
    }
    (out / "seeds" / "plan-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return summary


def _count(cases: list[dict[str, Any]], key: Any) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for case in cases:
        counts[key(case)] += 1
    return dict(sorted(counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--total", type=int, default=800)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--batch-size", type=int, default=25)
    args = parser.parse_args()
    summary = write_plan(build_plan(args.total), args.out, args.batch_size)
    print(json.dumps({k: v for k, v in summary.items() if k not in ("tickets", "batches")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
