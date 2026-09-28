"""Сборка справочника из ЕКП v046_24, учебных билетов и памятки о работе с карточкой.

Запуск из backend/: uv run python -m ml.scripts.build_kb
Редакторские правки в БД не перезаписываются при повторном сиде.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "spec" / "mocks"
OUTPUT = ROOT / "backend" / "data" / "kb"


def _unique(values: list[str], limit: int = 12) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))[:limit]


def build_articles(classifier: dict[str, Any], cards: dict[str, Any]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    tickets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in classifier["entries"]:
        groups[entry["group"]].append(entry)
    for card in cards["cards"]:
        tickets[card["group"]].append(card)

    articles = []
    for group, entries in sorted(groups.items()):
        examples = tickets[group]
        signs = _unique([str(entry.get(key) or "") for entry in entries for key in ("sign1", "sign2", "sign3", "extraSigns")])
        notifications = _unique([
            f"{item['service']} — {item['condition']}" if item.get("condition") else str(item.get("service") or "")
            for entry in entries for item in entry.get("notifications", []) if item.get("mode") != "none" and item.get("service")
        ], limit=30)
        clarify = _unique([str(tag) for card in examples for tag in card.get("expectedTags", [])])
        if not clarify:
            clarify = signs[:5]
        if not clarify:
            clarify = ["Уточнить признаки происшествия и адрес по опросной карте"]
        services = _unique([str(entry.get("mainService") or "") for entry in entries], limit=20)
        decision = [f"Сверить профиль службы с ЕКП; главная служба: {service}" for service in services]
        decision.append("При профильной карточке принять и вести статусы реагирования; при непрофильной указать причину в комментарии")
        errors = ["Неверно выбран итоговый тип происшествия", "Не уточнён адрес или обязательные признаки"]
        if any(card.get("crossRegion") for card in examples):
            errors.append("Не распознано обращение из другого региона")
        if any(card.get("duplicateOf") for card in examples):
            errors.append("Не распознано повторное обращение")
        article_id = "kb-" + hashlib.sha1(group.encode("utf-8")).hexdigest()[:12]
        articles.append({
            "id": article_id, "group": group, "title": group[0].upper() + group[1:],
            "sections": {"signs": signs, "notification": notifications, "clarify": clarify,
                         "ddsDecision": decision, "typicalErrors": errors},
            "sources": {"classifier": "v046_24", "ticketIds": [card["id"] for card in examples],
                        "domainMemo": "specs/kb/04-domain/card-and-statuses.md"},
        })
    return articles


def main() -> None:
    classifier = json.loads((SOURCE / "classifier.json").read_text(encoding="utf-8"))
    cards = json.loads((SOURCE / "cards.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    articles = build_articles(classifier, cards)
    for article in articles:
        (OUTPUT / f"{article['id']}.json").write_text(json.dumps(article, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Собрано статей: {len(articles)}")


if __name__ == "__main__":
    main()
