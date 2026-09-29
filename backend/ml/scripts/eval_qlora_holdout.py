"""Оценка QLoRA-адаптера на закрытом holdout: точность вердикта, валидность JSON, ссылки на факты, инъекции.

Holdout открывается только для финальной оценки (manifest.json → warnings), не для подбора гиперпараметров.
Результаты пишутся построчно в `holdout_predictions.jsonl` (прогон можно прервать и продолжить, готовые примеры пропускаются).

    python backend/ml/scripts/eval_qlora_holdout.py --limit 3        # дымовой прогон
    python backend/ml/scripts/eval_qlora_holdout.py                  # полный holdout, 110 примеров
    python backend/ml/scripts/eval_qlora_holdout.py --no-adapter     # базовая модель без адаптера (для сравнения)
    python backend/ml/scripts/eval_qlora_holdout.py --server http://127.0.0.1:8081   # Q4 GGUF через llama.cpp/LM Studio (OpenAI API)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

os.environ.setdefault("BNB_CUDA_VERSION", "124")

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

REPO = Path(__file__).resolve().parents[3]
RELEASE = REPO / "backend" / "data" / "ai_dataset" / "v1" / "release"
DECISIONS = ("equivalent", "different", "uncertain")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def parse_answer(text: str) -> dict[str, Any] | None:
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        obj = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def check_answer(ans: dict[str, Any] | None, payload: dict[str, Any], gold: dict[str, Any]) -> dict[str, Any]:
    ids = [f["id"] for f in payload["referenceFacts"]]
    out = {"jsonValid": ans is not None, "schemaOk": False, "decisionOk": False, "refIdsOk": False, "missingOk": False, "confOk": False}
    if ans is None:
        return out
    dec, refs, miss = ans.get("decision"), ans.get("referenceFactIds"), ans.get("missingFactIds", [])
    expl, conf = ans.get("explanation"), ans.get("confidence")
    out["schemaOk"] = (
        dec in DECISIONS and isinstance(refs, list) and isinstance(miss, list) and isinstance(expl, str) and 0 < len(expl) <= 500
        and isinstance(conf, (int, float)) and 0 <= conf <= 1 and set(ans) <= {"decision", "referenceFactIds", "missingFactIds", "explanation", "confidence"}
    )
    out["decisionOk"] = dec == gold["decision"]
    out["refIdsOk"] = isinstance(refs, list) and refs == ids
    out["hallucinatedIds"] = sorted((set(refs or []) | set(miss or [])) - set(ids)) if isinstance(refs, list) and isinstance(miss, list) else ["?"]
    out["missingOk"] = isinstance(miss, list) and set(miss) == set(gold["missingFactIds"])
    if dec == "uncertain":
        out["confOk"] = conf == 0
    elif isinstance(conf, (int, float)):
        out["confOk"] = (0.8 <= conf <= 0.95) if dec == "equivalent" else (0.75 <= conf <= 0.95) if dec == "different" else False
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-id", default=str(REPO / "backend" / "models" / "qwen3.5_0.8b"))
    p.add_argument("--adapter", default=str(REPO / "backend" / "models" / "qwen3.5_0.8b_qlora_adapter" / "final"))
    p.add_argument("--no-adapter", action="store_true", help="Базовая модель без адаптера")
    p.add_argument("--server", default="", help="URL OpenAI-совместимого сервера (llama-server, LM Studio): оценка GGUF вместо HF-модели")
    p.add_argument("--split", default="holdout", choices=["holdout", "validation"])
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--max-new-tokens", type=int, default=260)
    p.add_argument("--out", default="")
    args = p.parse_args()

    tag = "gguf" if args.server else "base" if args.no_adapter else "adapter"
    out_path = Path(args.out) if args.out else REPO / "backend" / "var" / f"{args.split}_predictions_{tag}.jsonl"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    records = load_jsonl(RELEASE / f"{args.split}.jsonl")
    meta = {m["id"]: m for m in load_jsonl(RELEASE / "metadata.jsonl")}
    if args.limit:
        records = records[: args.limit]
    done = {r["id"] for r in load_jsonl(out_path)} if out_path.exists() else set()

    tokenizer = model = None
    if not args.server:
        tokenizer = AutoTokenizer.from_pretrained(args.model_id)
        print(f"[{time.strftime('%H:%M:%S')}] загрузка модели ({tag})...", flush=True)
        bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
        model = AutoModelForCausalLM.from_pretrained(args.model_id, quantization_config=bnb, device_map={"": 0}, dtype=torch.float16)
        if not args.no_adapter:
            model = PeftModel.from_pretrained(model, args.adapter)
        model.eval()

    t0 = time.time()
    todo = [r for r in records if r["id"] not in done]
    for i, rec in enumerate(todo, 1):
        msgs = rec["messages"]
        if args.server:
            text = generate_via_server(args.server, msgs[:2], args.max_new_tokens)
        else:
            prompt = tokenizer.apply_chat_template(msgs[:2], tokenize=False, add_generation_prompt=True)
            ids = tokenizer(prompt, return_tensors="pt", add_special_tokens=False).to("cuda")
            with torch.no_grad():
                gen = model.generate(**ids, max_new_tokens=args.max_new_tokens, do_sample=False, use_cache=True)
            text = tokenizer.decode(gen[0, ids["input_ids"].shape[1]:], skip_special_tokens=True)
        payload, gold = json.loads(msgs[1]["content"]), json.loads(msgs[2]["content"])
        ans = parse_answer(text)
        row = {"id": rec["id"], "raw": text, "answer": ans, "gold": gold, "checks": check_answer(ans, payload, gold), "meta": meta[rec["id"]]["labels"] | {"field": meta[rec["id"]]["field"], "mode": meta[rec["id"]]["mode"]}}
        with out_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        el = time.time() - t0
        print(f"[{time.strftime('%H:%M:%S')}] {i}/{len(todo)} ({100*i/len(todo):.0f}%) {el/i:.1f} с/пример, осталось ~{el/i*(len(todo)-i)/60:.0f} мин | gold={gold['decision']} pred={(ans or {}).get('decision')}", flush=True)

    report(load_jsonl(out_path), tag, out_path.with_suffix(".report.json"))


def generate_via_server(url: str, messages: list[dict[str, str]], max_tokens: int) -> str:
    """Один жадкий запрос к OpenAI-совместимому серверу (llama-server, LM Studio, Ollama /v1)."""
    body = json.dumps({"messages": messages, "temperature": 0, "max_tokens": max_tokens, "stream": False}).encode("utf-8")
    req = urllib.request.Request(url.rstrip("/") + "/v1/chat/completions", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"]


def report(rows: list[dict[str, Any]], tag: str, path: Path) -> None:
    n = len(rows)

    def pct(k: str) -> float:
        return round(100 * sum(1 for r in rows if r["checks"].get(k)) / n, 1)

    conf = Counter((r["gold"]["decision"], (r["answer"] or {}).get("decision", "нет JSON")) for r in rows)
    by_field: dict[str, list[bool]] = defaultdict(list)
    for r in rows:
        by_field[r["meta"]["field"]].append(r["checks"]["decisionOk"])
    inj = [r["checks"]["decisionOk"] for r in rows if r["meta"]["injection"]]
    diff = [r for r in rows if r["gold"]["decision"] == "different"]
    unc = [r for r in rows if r["gold"]["decision"] == "uncertain"]
    rep = {
        "model": tag, "examples": n,
        "jsonValidPct": pct("jsonValid"), "schemaOkPct": pct("schemaOk"), "decisionAccuracyPct": pct("decisionOk"),
        "referenceFactIdsExactPct": pct("refIdsOk"), "missingFactIdsExactPct": pct("missingOk"), "confidenceRulePct": pct("confOk"),
        "hallucinatedIdExamples": sum(1 for r in rows if r["checks"].get("hallucinatedIds")),
        "differentRecallPct": round(100 * sum(r["checks"]["decisionOk"] for r in diff) / max(len(diff), 1), 1),
        "uncertainRecallPct": round(100 * sum(r["checks"]["decisionOk"] for r in unc) / max(len(unc), 1), 1),
        "falseAccusationPct": round(100 * sum(1 for r in rows if r["gold"]["decision"] == "equivalent" and (r["answer"] or {}).get("decision") == "different") / max(sum(1 for r in rows if r["gold"]["decision"] == "equivalent"), 1), 1),
        "injectionExamples": len(inj), "injectionAccuracyPct": round(100 * sum(inj) / max(len(inj), 1), 1),
        "byFieldAccuracyPct": {k: round(100 * sum(v) / len(v), 1) for k, v in by_field.items()},
        "confusion(gold→pred)": {f"{g}→{p}": c for (g, p), c in sorted(conf.items())},
    }
    path.write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
