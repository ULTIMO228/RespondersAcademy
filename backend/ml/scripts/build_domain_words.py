"""Доменный словарь `backend/data/domain_words.txt` для спеллчекера (R2): слова из сидов и памятки.

Запуск: `uv run python -m ml.scripts.build_domain_words`. Берутся все словоформы из карточек, сценариев,
классификатора ЕКП, справочников и служб (spec/000-фронт/mocks), адресов `mocks/local/addresses.json`, названий улиц
справочника `data/streets/moscow_streets.json` (иначе валидатор билетов правил бы «Сумская» → «Сумка»),
плюс ручной список терминов ниже.
Слова доменного словаря считаются правильными и не исправляются.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from app.config import get_settings

OUTPUT = Path(__file__).resolve().parents[2] / "data" / "domain_words.txt"
WORD = re.compile(r"[А-Яа-яЁё]{2,}")
MANUAL_TERMS = """
ДДС ЕКП ЦУС АРМ ПОВ ОДС ЖКХ УК СМП ГИБДД ДПС МЧС МВД МОСГАЗ Мосгаз Мосводоканал Мослифт Мосэнерго МОЭК ОАТИ ГБУ Жилищник
Ростелеком Практика ПИК управа префектура дежурный дежурная диспетчер диспетчерская оперативный оперативная
реагирование реагирования реагированию оповещение оповещения оповещён оповещена наряд наряда наряду нарядом
бригада бригады бригаду бригадой расчёт расчёта расчёту расчётом направлен направлена направлены направлено
выехал выехала выехали прибыл прибыла прибыли принято принята приняты отказ отказано передано передана переданы
компетенции компетенция территорию территория обслуживаем обслуживает обслуживается дубль дублирует профильное
происшествие происшествия происшествию заявитель заявителя заявителю карточка карточки карточку статус статуса
статусы регламент регламентный локализовано локализован ликвидировано ликвидирован перекрыт перекрыта перекрыто
эвакуированы эвакуирован оцеплено оцеплен задымление возгорание запах газа утечка прорыв затопление подтопление
пострадавший пострадавшие пострадавших госпитализирован госпитализирована лифт лифта лифте подъезд подъезде
электрощитке электрощиток провод провода светофор дорожное покрытие люк смена смены сменой руководитель
инженер аварийная аварийный ДТП ЧС ЧП ГС РДС Волгоградской Московской Тульской Калужской Рязанской Тверской
ЕДДС ЦУКС ЦУКБ ЦОДД ОИВ ПСЦ АСМ АСС ПСО ПСЧ СПСЧ ЭОС ОМВД УВД ОВД ГУ ГКУ ГБУЗ ГКБ ЦАФАП МосгорБТИ АО ООО ЕКП
госпитализация госпитализации эвакуация эвакуации эвакуирована эвакуированы отработка отработки отработку
уведомлён уведомлена уведомлены уведомлено оповещена оповещены ориентир ориентиры ориентира задвижка задвижку
обесточен обесточена обесточено перекрыли локализация ликвидация последствий задымления возгорания
""".split()


def read_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def collect_words(value, counter: Counter) -> None:
    if isinstance(value, str):
        counter.update(WORD.findall(value))
    elif isinstance(value, dict):
        for item in value.values():
            collect_words(item, counter)
    elif isinstance(value, list):
        for item in value:
            collect_words(item, counter)


def main() -> int:
    root = get_settings().seed_dir
    counter: Counter = Counter()
    for name in ("cards.json", "scenarios.json", "classifier.json", "reference.json", "users.json"):
        path = root / "spec" / "000-фронт" / "mocks" / name
        if path.exists():
            collect_words(read_json(path), counter)
    local = root / "mocks" / "local" / "addresses.json"
    if local.exists():
        collect_words(read_json(local), counter)
    streets = OUTPUT.parent / "streets" / "moscow_streets.json"
    if streets.exists():
        for street in read_json(streets).get("streets", []):
            counter.update(WORD.findall(str(street.get("name") or "")))
    memo = root / "hack" / "Фронт" / "Работа с АРМ-112 для ДДС от ОКр_ГСИ.md"
    if memo.exists():
        counter.update(WORD.findall(memo.read_text(encoding="utf-8")))
    counter.update(MANUAL_TERMS)
    words = sorted({w for w in counter}, key=lambda w: w.lower())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(words) + "\n", encoding="utf-8")
    print(f"{OUTPUT}: {len(words)} слов")
    return 0


if __name__ == "__main__":
    sys.exit(main())
