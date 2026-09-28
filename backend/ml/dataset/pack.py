"""Упаковка принятых примеров в выпуск датасета: чат-JSONL по разбиениям, метаданные, manifest, datasheet, zip.

В выпуск попадает пример, только если: (1) нет жёстких ошибок валидатора, (2) есть запись `accept` в
`reviews/claude-review.jsonl`, (3) человек не отклонил его в `reviews/human-review.jsonl`. Ответ модели собирается
из плана (метка, факты, confidence) и текста объяснения; итоговый JSON проверяется схемой SemanticReviewV1.

    uv run python -m ml.dataset.pack --dir data/ai_dataset/v1 --version v1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import jsonschema

from ml.dataset.validate import load_completions, load_jsonl, validate_dir

REPO = Path(__file__).resolve().parents[3]
SCHEMA = REPO / "spec" / "001-ai" / "contracts" / "semantic-review-v1.schema.json"
PROMPT = REPO / "backend" / "ml" / "prompts" / "semantic_review_v1.md"
ZIP_DIR = REPO / "backend" / "var" / "ai_dataset"
SPLIT_FILES = {"train": "train.jsonl", "validation": "validation.jsonl", "holdout": "holdout.jsonl"}
GENERATOR = "claude-haiku-4-5 (тексты и объяснения); часть неопределённых примеров написана Claude вручную; рецепты и метки — план ml.dataset.plan"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def user_message(case: dict[str, Any], student_text: str) -> str:
    payload = {
        "mode": case["mode"],
        "field": case["field"],
        "situation": case["situation"],
        "referenceFacts": case["referenceFacts"],
        "verifiedRules": case["verifiedRules"],
        "studentText": student_text,
    }
    return json.dumps(payload, ensure_ascii=False)


def assistant_message(case: dict[str, Any], explanation: str) -> str:
    target = case["target"]
    answer = {
        "decision": target["decision"],
        "referenceFactIds": target["referenceFactIds"],
        "missingFactIds": target["missingFactIds"],
        "explanation": explanation.strip(),
        "confidence": target["confidence"],
    }
    return json.dumps(answer, ensure_ascii=False)


def pack(root: Path, version: str) -> dict[str, Any]:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    prompt = PROMPT.read_text(encoding="utf-8").strip()
    cases = {c["caseId"]: c for c in load_jsonl(root / "seeds" / "cases.jsonl")}
    completions, _errors = load_completions(root)
    report = validate_dir(root)
    claude = {r["caseId"]: r for r in load_jsonl(root / "reviews" / "claude-review.jsonl")}
    human_path = root / "reviews" / "human-review.jsonl"
    human_rejected = {r["caseId"] for r in load_jsonl(human_path) if r.get("verdict") == "reject"} if human_path.exists() else set()
    sample_path = root / "reviews" / "human-sample.md"
    sample_ids = {line.split()[0] for line in sample_path.read_text(encoding="utf-8").splitlines() if line.startswith("sr-")} if sample_path.exists() else set()

    out = root / "release"
    out.mkdir(exist_ok=True)
    rows: dict[str, list[str]] = {s: [] for s in SPLIT_FILES}
    meta: list[str] = []
    excluded: Counter[str] = Counter()
    kept: list[dict[str, Any]] = []
    for cid, case in cases.items():
        if cid not in completions:
            excluded["нет выполнения"] += 1
            continue
        if report["results"][cid]["errors"]:
            excluded["ошибки валидатора"] += 1
            continue
        if claude.get(cid, {}).get("verdict") != "accept":
            excluded["не принят разбором Claude" if cid in claude else "нет разбора Claude"] += 1
            continue
        if cid in human_rejected:
            excluded["отклонён человеком"] += 1
            continue
        answer = assistant_message(case, completions[cid]["explanation"])
        jsonschema.validate(json.loads(answer), schema)
        record = {
            "id": cid,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_message(case, completions[cid]["studentText"])},
                {"role": "assistant", "content": answer},
            ],
        }
        rows[case["split"]].append(json.dumps(record, ensure_ascii=False))
        recipe = case["recipe"]
        meta.append(
            json.dumps(
                {
                    "id": cid,
                    "split": case["split"],
                    "sourceTicketId": case["sourceTicketId"],
                    "situationNo": case["situationNo"],
                    "mode": case["mode"],
                    "field": case["field"],
                    "labels": {
                        "decision": case["target"]["decision"],
                        "perturbation": recipe["perturbation"],
                        "style": recipe["style"],
                        "injection": recipe["injection"],
                    },
                    "author": "claude" if "вручную" in claude[cid].get("note", "") else "haiku",
                    "checks": {"deterministic": "passed", "flags": report["results"][cid]["flags"], "claudeReview": "accepted", "humanSample": cid in sample_ids},
                },
                ensure_ascii=False,
            )
        )
        kept.append(case)

    for split, name in SPLIT_FILES.items():
        (out / name).write_text("\n".join(rows[split]) + ("\n" if rows[split] else ""), encoding="utf-8")
    (out / "metadata.jsonl").write_text("\n".join(meta) + "\n", encoding="utf-8")
    (out / "system_prompt.md").write_text(prompt + "\n", encoding="utf-8")

    manifest = {
        "schemaVersion": "dataset-manifest/1",
        "name": "ai-semantic-review",
        "version": version,
        "createdAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "task": "Смысловой разбор спорного случая → SemanticReviewV1 (spec/001-ai/contracts/semantic-review-v1.schema.json)",
        "targetModel": "Qwen3.5-0.8B (QLoRA, обучение вне репозитория)",
        "format": "chat JSONL: messages[system,user,assistant]; обучать только по токенам assistant",
        "promptVersion": "semantic_review_v1",
        "promptSha256": sha256(PROMPT),
        "outputSchemaSha256": sha256(SCHEMA),
        "generator": GENERATOR,
        "planSeed": 112,
        "counts": {
            "total": len(kept),
            "bySplit": dict(Counter(c["split"] for c in kept)),
            "byDecision": dict(Counter(c["target"]["decision"] for c in kept)),
            "byField": dict(Counter(c["field"] for c in kept)),
            "byMode": dict(Counter(c["mode"] for c in kept)),
            "byAuthor": dict(Counter("claude" if "вручную" in claude[c["caseId"]].get("note", "") else "haiku" for c in kept)),
            "injection": sum(1 for c in kept if c["recipe"]["injection"]),
            "excluded": dict(excluded),
        },
        "sourceTickets": {s: sorted({c["sourceTicketId"] for c in kept if c["split"] == s}) for s in SPLIT_FILES},
        "provenance": {
            "sources": "синтетические обезличенные билеты spec/000-фронт/mocks (96 ситуаций, 32 билета); реальных ПДн нет",
            "identities": "ФИО, даты рождения (год сохранён) и госномера заменены сгенерированными (ml.dataset.identities)",
            "sanitizedGate": "backend/data/ai_dataset/sanitized_tickets.json, piiCheck=passed, утверждено человеком",
        },
        "verification": {
            "deterministic": "схема SemanticReviewV1, ID фактов, ПДн вне плана, дубликаты, рецепт инъекции/заявителя",
            "claudeReview": "смысловой разбор каждого примера (та же модельная семья, что и генератор — не независимый судья)",
            "humanSample": len(sample_ids),
            "independentJudge": False,
        },
        "warnings": [
            "holdout не использовать для обучения и подбора гиперпараметров; открывать только для финальной оценки",
            "независимого судьи другой модельной семьи нет (T042): выпуск помечается как проверенный детерминированно, Claude и выборкой человека",
        ],
        "files": {},
    }
    for name in [*SPLIT_FILES.values(), "metadata.jsonl", "system_prompt.md"]:
        manifest["files"][name] = {"sha256": sha256(out / name), "lines": len((out / name).read_text(encoding="utf-8").splitlines())}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "DATASHEET.md").write_text(datasheet(manifest), encoding="utf-8")

    ZIP_DIR.mkdir(parents=True, exist_ok=True)
    archive = ZIP_DIR / f"ai-semantic-review-{version}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(out.iterdir()):
            zf.write(file, f"ai-semantic-review-{version}/{file.name}")
    manifest["archive"] = {"path": str(archive), "sha256": sha256(archive)}
    return manifest


def datasheet(m: dict[str, Any]) -> str:
    c = m["counts"]
    return f"""# Датасет ai-semantic-review {m['version']}

Дообучение Qwen3.5-0.8B (QLoRA) на смысловом разборе спорных случаев тренажёра АРМ-112. Обучение вне репозитория.

## Состав
- Всего примеров: {c['total']}; по разбиениям: {c['bySplit']}; по вердиктам: {c['byDecision']}; по полям: {c['byField']}; по режимам: {c['byMode']}.
- Инъекции инструкций в тексте курсанта: {c['injection']}.
- Разбиение по исходному билету до генерации: билет целиком в одной части. Билеты: {m['sourceTickets']}.

## Файлы
- `train.jsonl`, `validation.jsonl` — обучение и подбор гиперпараметров.
- `holdout.jsonl` — закрытая оценка выпуска. **Не использовать при обучении и подборе.**
- `metadata.jsonl` — по строке на пример: разбиение, билет, поле, метки, результаты проверок.
- `system_prompt.md` — системная инструкция `{m['promptVersion']}` (sha256 в manifest), она же `system` в каждом примере.
- `manifest.json` — версии, хеши, счётчики, происхождение.

## Формат примера
`messages`: `system` — инструкция; `user` — JSON `{{mode, field, situation, referenceFacts[{{id,text}}], verifiedRules[], studentText}}`; `assistant` — JSON по схеме SemanticReviewV1 `{{decision, referenceFactIds, missingFactIds, explanation, confidence}}`.
Функция потерь — только по токенам `assistant`. Для `uncertain` `confidence = 0`.

## Правила меток
- `equivalent` — текст передаёт все факты эталона; `missingFactIds = []`.
- `different` — хотя бы один факт пропущен или искажён; `missingFactIds` — эти факты.
- `uncertain` — вердикт вынести нельзя: двусмысленный или не по теме текст, эталон пуст или противоречит ситуации.
- Время, адрес, коды, статусы и общий балл модель не оценивает; `verifiedRules` даны для контекста и не влияют на метку.

## Происхождение и проверка
- {m['provenance']['sources']}.
- {m['provenance']['identities']}.
- Генерация: {m['generator']}.
- Проверка: {m['verification']['deterministic']}; смысловой разбор Claude по каждому примеру; просмотр человеком выборки из {m['verification']['humanSample']} примеров.

## Ограничения
{chr(10).join('- ' + w for w in m['warnings'])}
- Всего 32 исходных билета: примеры внутри одной ситуации похожи по фактам; метрики на holdout измеряют перенос на новые билеты, а не на новые типы происшествий.
- Тексты курсантов — синтетика, а не реальные ответы; на реальных ответах качество нужно перепроверить.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--version", default="v1")
    args = parser.parse_args()
    manifest = pack(args.dir, args.version)
    print(json.dumps({k: manifest[k] for k in ("counts", "archive")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
