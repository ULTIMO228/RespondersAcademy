"""Детерминированная проверка выполнений Haiku против плана (что скрипт может проверить без смысла).

Жёсткие ошибки (`errors`) отклоняют пример: формат, объём, ПДн вне плана, выдуманные имена, служебные слова
в объяснении, несоответствие рецепту инъекции/упоминания заявителя, дубликаты. Мягкие `flags` — сигналы для
смыслового разбора (эвристика по основам слов, близкие тексты, противоречие вердикту в объяснении); решает разбор.

    uv run python -m ml.dataset.validate --dir data/ai_dataset/v1 [--only-completed]
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from ml.dataset import identities
from ml.nlp.semantic import lexical_coverage, lexical_similarity
from ml.pipeline.checks import EMAIL_PATTERN, PHONE_PATTERN

TEXT_LIMITS = {
    "description": (15, 420),
    "dispatcherAction": (10, 230),
    "serviceReport": (30, 420),
    "refusalComment": (10, 230),
}
EXPLANATION_LIMITS = (15, 320)
INJECTION_PATTERN = re.compile(
    r"игнорир|системн\w+ сообщени|\[admin\]|для проверяющего|equivalent|максимальн\w+ оценк|преподаватель разрешил|забудь про эталон",
    re.IGNORECASE,
)
INJECTION_NOTE = re.compile(r"инструкц\w*[^.]*проигнорир|проигнорир\w*[^.]*инструкц", re.IGNORECASE)
FORBIDDEN_IN_EXPLANATION = re.compile(
    r"confidence|verifiedRules|рецепт|метк[аиу]|датасет|план[ау]? |думаю|рассужда|шаг \d|<think|fact:|```", re.IGNORECASE
)
FORBIDDEN_IN_TEXT = re.compile(r"fact:|```|как ии|\bJSON\b", re.IGNORECASE)
NOT_CONVEYED = re.compile(r"не передан|искаж|не указан|пропущен|не хватает|не названа|не упомянут|отсутствует|не сообщ", re.IGNORECASE)
MATCHED = re.compile(r"расхождений нет|полностью соответству|все факты", re.IGNORECASE)
UNCERTAIN_REASON = re.compile(r"два прочтени|две трактов|не по теме|не относится|пуст|нельзя|невозможн|неясн|не удаётся|противоре", re.IGNORECASE)
DATE_PATTERN = re.compile(r"\d{2}\.\d{2}\.\d{4}")
BAD_ABBREVIATIONS = re.compile(r"\bПрим\.|\bСоб\.|\bЧД\b|муср\.|возг\.|\bБСМ\b|нарядя", re.IGNORECASE)
RECEIPT_WORDS = re.compile(r"принят|получен|зафиксирован|поступил|принял", re.IGNORECASE)
REGION = re.compile(r"[А-ЯЁ][а-яё]+(?:ской|ской) област")
VAGUE = re.compile(
    r"как (обычно|всегда|в прошл|раньше|положено|договор|договар|указано|говорил|по инструкц|по регламент)|по (указанному|стандартн|типов|инструкц|регламент|протокол|плану|процедур)|"
    r"прошл|выше|позже|потом|туда|они |там |ок\b|понял|см\.|обработ|стандартн|типов|поступит|допишу|уточн|как надо|как всегда",
    re.IGNORECASE,
)
LEAKS = 0.5
NEAR_DUPLICATE = 0.8
LOW_COVERAGE = 0.34
STILL_PRESENT = 0.8


def norm(text: str) -> str:
    return " ".join(re.findall(r"[а-яa-z0-9]+", text.lower().replace("ё", "е")))


def _seed_text(case: dict[str, Any]) -> str:
    parts = [case["situation"], *(f["text"] for f in case["referenceFacts"])]
    parts.extend(f for f in case["recipe"].get("foreignFacts", []))
    if case.get("applicant"):
        parts.append(case["applicant"]["name"])
    return "\n".join(parts)


def _pii_errors(case: dict[str, Any], text: str) -> list[str]:
    errors: list[str] = []
    allowed = _seed_text(case)
    for phone in PHONE_PATTERN.findall(text):
        if phone not in allowed:
            errors.append(f"телефон вне плана: {phone}")
    if EMAIL_PATTERN.search(text):
        errors.append("email в тексте")
    for date in DATE_PATTERN.findall(text):
        if date not in allowed:
            errors.append(f"дата вне плана: {date}")
    for plate in identities.PLATE.findall(text):
        if plate.replace(" ", "") not in allowed.replace(" ", ""):
            errors.append(f"госномер вне плана: {plate}")
    for match in identities.FULL_NAME.finditer(text):
        if match.group(0) not in allowed:
            errors.append(f"ФИО вне плана: {match.group(0)}")
    surnames = {form for pair in identities.SURNAMES for form in pair}
    names = set(identities.MALE_NAMES) | set(identities.FEMALE_NAMES)
    tokens = [t.strip(",.;:()«»") for t in text.split()]
    for first, second in zip(tokens, tokens[1:], strict=False):
        if first in surnames and second in names and f"{first} {second}" not in allowed:
            errors.append(f"имя вне плана: {first} {second}")
    return errors


def identifiers(text: str) -> list[str]:
    """Точные идентификаторы факта, которые нельзя терять при пересказе: госномера, даты, номер карточки, ФИО."""
    found = [m.group(0) for m in identities.PLATE.finditer(text)]
    found += DATE_PATTERN.findall(text)
    found += re.findall(r"номер карточки: (\d{4})", text)
    found += [m.group(0) for m in identities.FULL_NAME.finditer(text)]
    found += [m.group(0)[:6] for m in REGION.finditer(text)]
    surnames = {form for pair in identities.SURNAMES for form in pair}
    names = set(identities.MALE_NAMES) | set(identities.FEMALE_NAMES)
    tokens = [t.strip(",.;:()«»") for t in text.split()]
    for first, second in zip(tokens, tokens[1:], strict=False):
        if first in surnames and second in names and not any(first in f for f in found):
            found.append(f"{first} {second}")
    return found


def _squash(text: str) -> str:
    return re.sub(r"\s+", "", text).casefold().replace("ё", "е")


def check_case(case: dict[str, Any], completion: dict[str, Any] | None) -> tuple[list[str], list[str]]:
    """(errors, flags) для одного случая."""
    if completion is None:
        return ["нет выполнения"], []
    errors: list[str] = []
    flags: list[str] = []
    if set(completion) != {"caseId", "studentText", "explanation"}:
        return [f"ключи строки: {sorted(completion)}"], []
    text, explanation = completion["studentText"], completion["explanation"]
    if not isinstance(text, str) or not isinstance(explanation, str):
        return ["studentText/explanation не строки"], []

    lo, hi = TEXT_LIMITS[case["field"]]
    if not lo <= len(text) <= hi:
        errors.append(f"длина studentText {len(text)} вне [{lo},{hi}]")
    if not EXPLANATION_LIMITS[0] <= len(explanation) <= EXPLANATION_LIMITS[1]:
        errors.append(f"длина explanation {len(explanation)} вне {list(EXPLANATION_LIMITS)}")
    if FORBIDDEN_IN_TEXT.search(text):
        errors.append("служебные слова в studentText")
    if FORBIDDEN_IN_EXPLANATION.search(explanation):
        errors.append("служебные слова/ход рассуждения в explanation")
    errors += _pii_errors(case, text + "\n" + explanation)

    recipe = case["recipe"]
    if recipe["injection"]:
        if not INJECTION_PATTERN.search(text):
            errors.append("рецепт требует инъекцию, её нет в тексте")
        if not INJECTION_NOTE.search(explanation):
            errors.append("в объяснении нет пометки об игнорировании инструкции")
    else:
        if INJECTION_PATTERN.search(text):
            errors.append("инъекция в тексте, которой нет в рецепте")
        if re.search(r"проигнорир", explanation, re.IGNORECASE):
            errors.append("пометка об инъекции без инъекции")

    applicant = case.get("applicant")
    if applicant:
        surname = applicant["name"].split()[0]
        if applicant["mention"] and applicant["name"] not in text:
            errors.append("заявитель должен быть назван дословно")
        if not applicant["mention"] and surname in text + explanation:
            errors.append("заявитель назван, хотя не должен")

    decision = case["target"]["decision"]
    by_id = {f["id"]: f["text"] for f in case["referenceFacts"]}
    must_convey = list(by_id) if decision == "equivalent" else case["target"]["presentFactIds"] if decision == "different" else []
    for fid in must_convey:
        lost = [
            ident for ident in identifiers(by_id[fid])
            if _squash(ident) not in _squash(text) and not (ident == "Москов" and re.search(r"\bМО\b", text))
        ]
        if lost:
            errors.append(f"идентификатор из факта потерян: {', '.join(lost)}")
    if BAD_ABBREVIATIONS.search(text) or (case["field"] == "dispatcherAction" and re.search(r"\bа/м\b", text)):
        errors.append("нестандартное сокращение или «а/м» в действии диспетчера")
    perturbation = case["recipe"]["perturbation"]
    if perturbation in ("swapIncident", "ambiguousText", "offTopic"):
        leaked = [t for t in by_id.values() if lexical_coverage(t, text) >= LEAKS and len(t) > 20]
        if leaked and perturbation != "swapIncident":
            errors.append(f"{perturbation}: текст повторяет факт эталона ({len(leaked)})")
        elif leaked:
            flags.append(f"swapIncident: лексическое совпадение с фактом эталона ({len(leaked)})")
        if perturbation == "swapIncident" and case["field"] == "dispatcherAction" and RECEIPT_WORDS.search(text):
            errors.append("swapIncident: в действии диспетчера есть «принято/получено»")
        if perturbation in ("ambiguousText", "offTopic"):
            body = re.sub(r"\[ADMIN\][^.]*\.?", "", text)
            if re.search(r"\d", body):
                errors.append(f"{perturbation}: в неопределённом тексте есть цифры (конкретика)")
            if not VAGUE.search(text):
                errors.append(f"{perturbation}: нет признаков косвенного/пустого текста")
        present_ids = [i for t in by_id.values() for i in identifiers(t) if _squash(i) in _squash(text)]
        if present_ids:
            errors.append(f"{perturbation}: в тексте идентификаторы эталона: {', '.join(present_ids)}")
    if decision == "equivalent":
        weak = [t for i, t in by_id.items() if lexical_coverage(t, text) < LOW_COVERAGE]
        if weak:
            flags.append(f"equivalent: слабое лексическое покрытие фактов {len(weak)}/{len(by_id)}")
        if NOT_CONVEYED.search(explanation):
            flags.append("equivalent: объяснение говорит о потере факта")
    elif decision == "different":
        if case["recipe"]["perturbation"] in ("omitOne", "omitMany"):
            still = [by_id[i] for i in case["target"]["missingFactIds"] if lexical_coverage(by_id[i], text) >= STILL_PRESENT]
            if still:
                flags.append("different: пропущенный факт лексически присутствует")
        if MATCHED.search(explanation):
            flags.append("different: объяснение говорит о полном совпадении")
    else:
        if not UNCERTAIN_REASON.search(explanation):
            flags.append("uncertain: в объяснении нет причины неопределённости")
    return errors, flags


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                rows.append({"_parseError": f"{path.name}:{number}: {exc.msg}"})
    return rows


def load_completions(root: Path) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Выполнения агентов + правки разбора (`fix` в reviews/claude-review.jsonl поверх studentText/explanation)."""
    by_id = {c["caseId"] for c in load_jsonl(root / "seeds" / "cases.jsonl")}
    completions: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for path in sorted((root / "completions").glob("*.jsonl")):
        for row in load_jsonl(path):
            if "_parseError" in row:
                errors.append(row["_parseError"])
                continue
            cid = row.get("caseId")
            if cid not in by_id:
                errors.append(f"{path.name}: неизвестный caseId {cid}")
            elif cid in completions:
                errors.append(f"{path.name}: повторный caseId {cid}")
            else:
                completions[cid] = row
    review_path = root / "reviews" / "claude-review.jsonl"
    if review_path.exists():
        for review in load_jsonl(review_path):
            fix = review.get("fix")
            if fix and review.get("caseId") in completions:
                completions[review["caseId"]] = {**completions[review["caseId"]], **fix}
    return completions, errors


def validate_dir(root: Path, *, only_completed: bool = False) -> dict[str, Any]:
    cases = load_jsonl(root / "seeds" / "cases.jsonl")
    by_id = {c["caseId"]: c for c in cases}
    completions, file_errors = load_completions(root)

    results: dict[str, dict[str, Any]] = {}
    for case in cases:
        cid = case["caseId"]
        if only_completed and cid not in completions:
            continue
        errors, flags = check_case(case, completions.get(cid))
        results[cid] = {"errors": errors, "flags": flags}

    # Дубликаты: точные — ошибка у повторных; близкие внутри (ситуация, поле) — флаг.
    seen: dict[str, str] = {}
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for cid in results:
        if cid not in completions:
            continue
        key = norm(completions[cid]["studentText"])
        if key in seen:
            results[cid]["errors"].append(f"точный дубликат {seen[key]}")
        else:
            seen[key] = cid
        groups[(by_id[cid]["cardId"], by_id[cid]["field"])].append(cid)
    for members in groups.values():
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                if lexical_similarity(completions[a]["studentText"], completions[b]["studentText"]) >= NEAR_DUPLICATE:
                    results[b]["flags"].append(f"близок к {a}")

    total = len(results)
    failed = sorted(c for c, r in results.items() if r["errors"])
    flagged = sorted(c for c, r in results.items() if r["flags"] and not r["errors"])
    return {
        "checked": total,
        "completed": sum(1 for c in results if c in completions),
        "failed": len(failed),
        "flagged": len(flagged),
        "fileErrors": file_errors,
        "results": results,
        "failedIds": failed,
        "flaggedIds": flagged,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--only-completed", action="store_true")
    args = parser.parse_args()
    report = validate_dir(args.dir, only_completed=args.only_completed)
    (args.dir / "reports").mkdir(exist_ok=True)
    (args.dir / "reports" / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    summary = {k: v for k, v in report.items() if k not in ("results",)}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    for cid in report["failedIds"][:40]:
        print(cid, report["results"][cid]["errors"])


if __name__ == "__main__":
    main()
