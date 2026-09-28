"""Синтетика для классификатора групп ЕКП: `backend/data/labeled/synthetic_groups.json` (T059).

Источник — строки классификатора `spec/000-фронт/mocks/classifier.json` (принцип V: эталоны выводятся из ЕКП, не
придумываются). Для каждой строки — «фабула» из итогового типа и признаков опросной карты в двух формах
(признаки через запятую и как связный текст); группы без строк получают только своё название.
Детерминировано, без сети. Запуск: `uv run python -m ml.scripts.build_synthetic_groups`.
"""

from __future__ import annotations

import json
import sys

from ml.classify.ekp_group_classifier import SYNTHETIC_FILE, classifier_entries, entry_text, groups

TEMPLATES = ("{text}", "Сообщение заявителя: {final}. Признаки: {signs}")


def build() -> list[dict[str, str]]:
    samples: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(text: str, group: str) -> None:
        key = (text.strip(), group)
        if key[0] and key not in seen:
            seen.add(key)
            samples.append({"text": key[0], "group": group})

    for entry in classifier_entries():
        group = str(entry.get("group") or "")
        if not group:
            continue
        text = entry_text(entry)
        signs = ", ".join(s for s in (entry.get("sign1"), entry.get("sign2"), entry.get("sign3"), entry.get("extraSigns")) if s)
        final = str(entry.get("finalType") or entry.get("ekp35Type") or group)
        add(TEMPLATES[0].format(text=text), group)
        if signs:
            add(TEMPLATES[1].format(final=final, signs=signs), group)
    for group in groups():
        add(group, group)
    return samples


def main() -> int:
    samples = build()
    SYNTHETIC_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"source": "spec/000-фронт/mocks/classifier.json (v046.24)", "templates": list(TEMPLATES), "samples": samples}
    SYNTHETIC_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{SYNTHETIC_FILE}: {len(samples)} примеров, {len({s['group'] for s in samples})} групп")
    return 0


if __name__ == "__main__":
    sys.exit(main())
