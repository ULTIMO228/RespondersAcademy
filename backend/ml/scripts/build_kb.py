"""Сборка справочника из ЕКП v046_24, учебных билетов и памятки о работе с карточкой.

Запуск из backend/: uv run python -m ml.scripts.build_kb
Сид добавляет только отсутствующие статьи: правки преподавателей в БД не перезаписываются.

Правила содержания (всё берётся из источников, ничего не выдумывается):
- признаки и оповещения выводятся полностью, без обрезки; текст нормализуется (пробелы, висячие запятые);
- главная служба — название службы, а не код колонки xlsx;
- «что уточнить» — вопросы по признакам, которые ЕКП реально использует в условиях оповещения группы;
- «типичные ошибки» — типовые нарушения из памятки (specs/kb/04-domain/card-and-statuses.md).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "mocks"
OUTPUT = ROOT / "backend" / "data" / "kb"

# Колонка «Главная служба» xlsx хранит коды; названия — как в заголовках колонок оповещения.
SERVICE_NAMES = {
    "MCHS": "Служба 101 (МЧС)",
    "Police": "МВД (Служба 102)",
    "AMBULANCE": "СМП (Служба 103)",
    "MOSGAZ": "МОСГАЗ (Служба 104)",
    "ZEMP": "ЦЭМП",
    "ZODD": "ЦОДД",
    "GKH": "Городское хозяйство",
    "METRO": "Метро",
    "MZD": "РЖД",
    "OEK": "ОЭК",
    "MOEK": "МОЭК",
    "MOESK": "МОЭСК",
    "MOSGORTRANS": "Мосгортранс",
    "GORMOST": "ГОРМОСТ",
    "MGTS": "МГТС",
    "MOSLIFT": "Мослифт",
    "AUTOROADS": "Автомобильные дороги",
    "MOSVODOCANAL": "Мосводоканал",
    "MOSVODOSTOK": "Мосводосток",
    "MOSCOLLECTOR": "Москоллектор",
    "MSPPN": "МСППН",
    "Dep.tszn": "ОД Департамент ТСЗН",
    "DepEco": "Департамент ППиООС",
    "МСР": "ГУП МСР",
}

# Условие оповещения (текст колонки xlsx) → вопрос заявителю. Условия «… не выбран» не учитываются.
CONDITION_QUESTIONS = [
    (re.compile(r"\bНД\b"), "Есть ли доступ к месту происшествия (признак «Нет доступа»)"),
    (re.compile(r"[Пп]острадавш|[Пп]огибш|\bПП\b"), "Есть ли пострадавшие или погибшие (признак «Пострадавшие»)"),
    (re.compile(r"мед\. помощь"), "Нужна ли медицинская помощь"),
    (re.compile(r"\bУЛ\b|угроза людям"), "Есть ли угроза людям (признак «Угроза людям»)"),
    (re.compile(r"Правонарушение"), "Есть ли признаки правонарушения (признак «Правонарушение»)"),
    (re.compile(r"газификация"), "Газифицирован ли объект (признак «Газификация»)"),
    (re.compile(r"эвакуац"), "Требуется ли эвакуация"),
    (re.compile(r"перекрытие движени"), "Перекрыто ли движение"),
]
ADDRESS_QUESTION = "Точный адрес места происшествия: населённый пункт, улица, дом; при необходимости — описательный адрес"
MAX_INLINE_OPTIONS = 8

# Типовые нарушения при работе со статусами реагирования (памятка для ДДС, «Типовые нарушения»).
MEMO_ERRORS = [
    "Нет первичного статуса реагирования в течение 30 секунд после направления карточки",
    "Статус не соответствует фактическому: «Принята» при отсутствии реагирования вместо «Не принята» или «Отказ от выполнения работ»",
    "«Не принята» по профильному для службы происшествию без оснований",
    "Нет комментария к статусам «Не принята» и «Отказ от выполнения работ»",
    "Неполный комментарий: не указано, кому передана информация и по какой причине",
    "Нет статусов хода работ («Начало реагирования», «Прибытие», «Проведение работ») при длительном реагировании",
]
DECISION_RULE = (
    "Принять или отклонить карточку в течение 30 секунд после направления: «Принята» — реагирование будет; "
    "«Не принята» — реагирования не будет, комментарий обязателен (причина и кому передана информация)"
)


def _norm(value: Any) -> str:
    """Схлопывает пробелы и убирает висячие запятые/точки с запятой из выгрузки xlsx."""
    return " ".join(str(value or "").split()).strip(" ,;")


def _unique(values: list[Any]) -> list[str]:
    return list(dict.fromkeys(text for text in (_norm(value) for value in values) if text))


def service_name(code: str) -> str:
    """Название службы по коду колонки «Главная служба»; составной код («METRO, MZD») раскрывается по частям."""
    parts = [part.strip() for part in code.split(",") if part.strip()]
    return ", ".join(SERVICE_NAMES.get(part, part) for part in parts)


def _clarify(entries: list[dict[str, Any]], has_notifications: bool) -> list[str]:
    conditions = [
        str(item.get("condition") or "")
        for entry in entries for item in entry.get("notifications", [])
        if item.get("mode") != "none" and "не выбран" not in str(item.get("condition") or "")
    ]
    questions = [ADDRESS_QUESTION] if has_notifications else []
    questions += [question for pattern, question in CONDITION_QUESTIONS if any(pattern.search(text) for text in conditions)]
    for level, field in enumerate(("sign1", "sign2", "sign3"), start=1):
        options = _unique([entry.get(field) for entry in entries])
        if len(options) < 2:
            continue
        if len(options) <= MAX_INLINE_OPTIONS:
            questions.append(f"112-Признак.{level}: уточнить вариант — {' / '.join(options)}")
        else:
            questions.append(
                f"112-Признак.{level}: выбрать один из {len(options)} вариантов (перечень — в разделе «Признаки происшествия»)"
            )
    return questions or ["Уточнить суть обращения по опросной карте"]


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
        signs = _unique([entry.get(key) for entry in entries for key in ("sign1", "sign2", "sign3", "extraSigns")])
        notifications = _unique([
            f"{item['service']} — {item['condition']}" if item.get("condition") else item.get("service")
            for entry in entries for item in entry.get("notifications", []) if item.get("mode") != "none" and item.get("service")
        ])
        main_services = _unique([service_name(str(entry.get("mainService") or "")) for entry in entries])
        decision = [f"Сверить профиль службы с ЕКП; главная служба: {name}" for name in main_services]
        if not main_services:
            decision.append("Главная служба для этой группы в ЕКП не задана: ориентироваться на список оповещения карточки")
        decision.append(DECISION_RULE)
        errors = list(MEMO_ERRORS)
        if any(card.get("crossRegion") for card in examples):
            errors.append("Не распознано обращение из другого региона")
        if any(card.get("duplicateOf") for card in examples):
            errors.append("Не распознано повторное обращение: нужен комментарий «Не принята: дубль» или «реагирование по КП №…»")
        title = _norm(group)
        article_id = "kb-" + hashlib.sha1(group.encode("utf-8")).hexdigest()[:12]
        articles.append({
            "id": article_id, "group": group, "title": title[0].upper() + title[1:],
            "sections": {"signs": signs, "notification": notifications, "clarify": _clarify(entries, bool(notifications)),
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
