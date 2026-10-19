"""Этапы карты ошибок и соответствие «правило оценки → этап» (фича 003, data-model.md §3).

Источник истины по составу этапов и порядку — `spec/003-error-map/data-model.md` §3. Таблицы
черновые и требуют сверки с экспертом по обучению (решение D1): правки таблиц должны касаться
только этого файла.

Правило относится к этапу внутри режима. Одно и то же правило может попадать на разные этапы
разных режимов: `g1`, `f1`, `c1` — «Карточка» в режиме ДДС, но «Прочее» у специалиста-112 (§3).
Правило, не указанное в раскладке режима, уходит в «Прочее» (`other`), как сказано в §3 («любые
не отнесённые»), и это не теряет учёт ошибки (FR-007).

Идентификаторы правил — реальные `Rule.id` из `ml/assess/rules.py`. `articleId` у всех этапов
`None`: статей справочника по этапам нет (решение D6, `research.md` R8).

Таблицы проверяются при импорте: дубль правила в режиме, неизвестный id правила или этапа,
нарушенный порядок этапов и связи, идущие не вперёд, вызывают `ValueError`.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Final, Literal

from ml.assess.rules import RULES

Mode = Literal["operator112", "dds"]
MODES: Final[tuple[Mode, ...]] = ("dds", "operator112")

OTHER_STAGE_ID: Final = "other"
_OTHER_ORDER: Final = 9  # «Прочее» всегда последнее в ленте; в §3 у него нет номера

UNKNOWN_RULE_PLAIN: Final = "Прочая ошибка: разберите её вместе с обучающимся"


@dataclass(frozen=True)
class Stage:
    """Этап схемы приёма вызова. Поле `article_id` в API сериализуется как `articleId`."""

    id: str
    order: int
    title: str
    mode: Mode
    article_id: str | None = None


@dataclass(frozen=True)
class ChainLink:
    """Причинная связь между этапами: ошибка на `source` обычно влечёт ошибку на `target`.

    В API поля называются `from` и `to`; в Python `from` — ключевое слово.
    """

    source: str
    target: str
    caption: str


# ─── Этапы (data-model.md §3) ─────────────────────────────────────────────────────────────────────

STAGES: Final[Mapping[Mode, tuple[Stage, ...]]] = MappingProxyType(
    {
        "dds": (
            Stage(id="intake", order=1, title="Приём вызова", mode="dds"),
            Stage(id="address", order=2, title="Адрес", mode="dds"),
            Stage(id="decision", order=3, title="Тип происшествия", mode="dds"),
            Stage(id="card", order=4, title="Карточка", mode="dds"),
            Stage(id="services", order=5, title="Службы", mode="dds"),
            Stage(id="route", order=6, title="Маршрут", mode="dds"),
            Stage(id="statuses", order=7, title="Статусы реагирования", mode="dds"),
            Stage(id="closing", order=8, title="Закрытие", mode="dds"),
            Stage(id=OTHER_STAGE_ID, order=_OTHER_ORDER, title="Прочее", mode="dds"),
        ),
        "operator112": (
            Stage(id="intake", order=1, title="Приём вызова", mode="operator112"),
            Stage(id="applicant", order=2, title="Заявитель", mode="operator112"),
            Stage(id="place", order=3, title="Место", mode="operator112"),
            Stage(id="essence", order=4, title="Суть происшествия", mode="operator112"),
            Stage(id="type", order=5, title="Тип по классификатору", mode="operator112"),
            Stage(id="signs", order=6, title="Признаки и флаги", mode="operator112"),
            Stage(id="services", order=7, title="Оповещение служб", mode="operator112"),
            Stage(id="closing", order=8, title="Завершение", mode="operator112"),
            Stage(id=OTHER_STAGE_ID, order=_OTHER_ORDER, title="Прочее", mode="operator112"),
        ),
    }
)

# ─── Раскладка «этап → правила» (data-model.md §3) ───────────────────────────────────────────────

LAYOUT: Final[Mapping[Mode, tuple[tuple[str, tuple[str, ...]], ...]]] = MappingProxyType(
    {
        "dds": (
            ("intake", ("t1",)),
            ("address", ("a1", "a2", "a3", "a4")),
            ("decision", ("v2", "v2t", "d4", "tr1")),
            ("card", ("f1", "g1", "c1", "c2")),
            ("services", ("d1",)),
            ("route", ("d2", "d3")),
            ("statuses", ("v1", "v3", "v4", "v5", "v6", "v6b", "v6c", "v6l", "v7", "s1", "s2", "s3")),
            ("closing", ("t2", "t3")),
            (OTHER_STAGE_ID, ("x1", "m1")),
        ),
        "operator112": (
            ("intake", ("op-t0", "op-t1")),
            ("applicant", ("op-a1", "op-a2", "op-a3", "op-a4")),
            ("place", ("op-a5", "a1", "a2", "a3")),
            ("essence", ("op-d0", "op-d1")),
            ("type", ("op-f0", "op-f1")),
            ("signs", ("op-s1", "op-s2", "op-s3")),
            ("services", ("op-f2", "op-f3")),
            ("closing", ("op-t2", "op-t3")),
            (OTHER_STAGE_ID, ("g1", "f1", "c1")),
        ),
    }
)

# ─── Причинные связи (data-model.md §3, черновик) ───────────────────────────────────────────────

_CHAIN_TABLE: Final[Mapping[Mode, tuple[tuple[str, str, str], ...]]] = MappingProxyType(
    {
        "dds": (
            ("decision", "services", "Неверный тип → не те службы"),
            ("decision", "route", "Неверный тип → не тот маршрут"),
            ("address", "route", "Неверный адрес → не тот маршрут"),
            ("services", "statuses", "Не те службы → сбой в статусах"),
            ("statuses", "closing", "Статусы не доведены → карточка не закрыта"),
        ),
        "operator112": (
            ("essence", "type", "Неверное описание → неверный тип"),
            ("type", "signs", "Неверный тип → не выставлены признаки"),
            ("type", "services", "Неверный тип → не та служба в оповещении"),
            ("place", "services", "Неверный адрес → не те службы в оповещении"),
        ),
    }
)

# ─── Простые формулировки (по одной на каждое правило реестра, ≤ 90 символов) ───────────────────

RULE_PLAIN: Final[Mapping[str, str]] = MappingProxyType(
    {
        # Тайминги (Q&A: 30 с на реакцию, 3 мин на отработку)
        "t1": "Первая реакция на вызов дольше 30 секунд",
        "t2": "Карточка обработана дольше 3 минут",
        "t3": "Карточка не доведена до конца к окончанию занятия",
        # Адрес
        "a1": "Улица записана похожая, но не та, что в билете",
        "a2": "В названии улицы опечатка",
        "a3": "Адрес не совпадает с адресом из билета",
        "a4": "Улица не найдена в справочнике улиц Москвы",
        # Решение и ловушки
        "v2": "Статус реагирования не соответствует заявке",
        "v2t": "Не распознана ловушка в заявке: статус выбран неверно",
        "tr1": "Ловушка в вызове не распознана",
        "d4": "Повторная карточка не отмечена как дубль",
        # Памятка: нарушения №1–7
        "v1": "Не проставлен статус «Принята» или «Не принята»",
        "v3": "Отказались от реагирования на профильное происшествие",
        "v4": "У статуса нет комментария: не записано, почему и кому передали сведения",
        "v5": "Комментарий к статусу неполный: не хватает важных сведений",
        "v6": "Не проставлен статус хода работ после сведений о ходе реагирования",
        "v6c": "Статус хода работ без комментария о ходе реагирования",
        "v6b": "Статус поставлен раньше, чем пришли сведения о ходе работ",
        "v6l": "Статус поставлен слишком поздно после сообщения о ходе работ",
        "v7": "Не ответили на звонок отдела контроля или руководителя смены",
        # Службы и маршрут
        "d1": "Пропущен обязательный звонок, который нужно было сделать",
        "d2": "Сведения переданы не той службе",
        "d3": "Вызов не переведён в ЦУС другого региона: происшествие вне зоны",
        # Статусы хода работ
        "s1": "Не проставлен ожидаемый статус хода работ",
        "s2": "Статусы поставлены не в том порядке",
        "s3": "Карточка не закрыта: нет итогового статуса",
        # Карточка и смысл
        "c1": "В действиях не отражены ключевые моменты вызова",
        "c2": "В докладе по телефону пропущены обязательные пункты",
        "f1": "Не заполнено обязательное поле карточки",
        "g1": "Слишком много грамматических ошибок в карточке",
        # Многозадачность и угадывание
        "m1": "Параллельная карточка не открыта вовремя",
        "x1": "Решение принято слишком быстро: похоже на угадывание",
        # Режим специалиста-112
        "op-t0": "Вызов не принят: заявитель не дождался ответа оператора",
        "op-t1": "Вызов принят с опозданием",
        "op-t2": "Карточка отправлена позже нормы",
        "op-t3": "Карточка не отправлена: работа с ней не завершена",
        "op-f0": "Не выбран итоговый тип происшествия",
        "op-f1": "Выбран неверный итоговый тип происшествия",
        "op-f2": "В списке оповещения нет нужной службы",
        "op-f3": "В список оповещения добавлена лишняя служба",
        "op-s1": "Не отмечен признак происшествия из билета",
        "op-s2": "Не отмечен флаг о пострадавших или об отказе от скорой",
        "op-s3": "Отмечен флаг ЧС или ЧП без оснований",
        "op-d0": "Описание со слов заявителя не заполнено",
        "op-d1": "В описании не отражён важный факт из записи заявителя",
        "op-a1": "Имя заявителя записано неверно",
        "op-a2": "Статус заявителя записан неверно",
        "op-a3": "Телефон заявителя записан неверно",
        "op-a4": "Телефон заявителя не записан",
        "op-a5": "Адрес происшествия не заполнен",
    }
)


# ─── Проверка таблиц при импорте ────────────────────────────────────────────────────────────────


def _index_stages(mode: Mode) -> Mapping[str, Stage]:
    by_id: dict[str, Stage] = {}
    for stage in STAGES[mode]:
        if stage.mode != mode:
            raise ValueError(f"этап {stage.id} объявлен в режиме {stage.mode}, а стоит в {mode}")
        if stage.id in by_id:
            raise ValueError(f"дубль этапа {stage.id} в режиме {mode}")
        by_id[stage.id] = stage
    orders = [stage.order for stage in STAGES[mode]]
    if orders != list(range(1, len(orders) + 1)):
        raise ValueError(f"порядок этапов режима {mode} должен быть 1..n без пропусков: {orders}")
    if STAGES[mode][-1].id != OTHER_STAGE_ID:
        raise ValueError(f"«Прочее» должно быть последним этапом режима {mode}")
    return MappingProxyType(by_id)


def _map_rules(mode: Mode, stage_index: Mapping[str, Stage]) -> Mapping[str, Stage]:
    rule_to_stage: dict[str, Stage] = {}
    for stage_id, rule_ids in LAYOUT[mode]:
        if stage_id not in stage_index:
            raise ValueError(f"раскладка режима {mode} ссылается на неизвестный этап {stage_id}")
        for rule_id in rule_ids:
            if rule_id not in RULES:
                raise ValueError(f"раскладка режима {mode}: неизвестное правило {rule_id}")
            if rule_id in rule_to_stage:
                raise ValueError(f"правило {rule_id} отнесено дважды в режиме {mode}")
            rule_to_stage[rule_id] = stage_index[stage_id]
    return MappingProxyType(rule_to_stage)


def _build_chains(mode: Mode, stage_index: Mapping[str, Stage]) -> tuple[ChainLink, ...]:
    links: list[ChainLink] = []
    for source, target, caption in _CHAIN_TABLE[mode]:
        if source not in stage_index or target not in stage_index:
            raise ValueError(f"связь {source}→{target} ссылается на неизвестный этап режима {mode}")
        if OTHER_STAGE_ID in (source, target):
            raise ValueError(f"связь {source}→{target}: «Прочее» не участвует в причинных связях")
        if stage_index[source].order >= stage_index[target].order:
            raise ValueError(f"связь {source}→{target} в режиме {mode} идёт не вперёд по порядку")
        links.append(ChainLink(source=source, target=target, caption=caption))
    return tuple(links)


_STAGE_INDEX: Final[Mapping[Mode, Mapping[str, Stage]]] = MappingProxyType({m: _index_stages(m) for m in MODES})
_RULE_STAGE: Final[Mapping[Mode, Mapping[str, Stage]]] = MappingProxyType(
    {m: _map_rules(m, _STAGE_INDEX[m]) for m in MODES}
)
CHAINS: Final[Mapping[Mode, tuple[ChainLink, ...]]] = MappingProxyType(
    {m: _build_chains(m, _STAGE_INDEX[m]) for m in MODES}
)


# ─── Публичные функции ──────────────────────────────────────────────────────────────────────────


def _check_mode(mode: str) -> Mode:
    for known in MODES:
        if mode == known:
            return known
    raise ValueError(f"неизвестный режим: {mode!r}")


def stages_for_mode(mode: str) -> tuple[Stage, ...]:
    """Все этапы режима по порядку ленты, включая «Прочее» последним.

    Сервис сам решает, показывать ли «Прочее»: по §3 оно выводится, только если на нём есть ошибки.
    """
    return STAGES[_check_mode(mode)]


def get_stage(mode: str, stage_id: str) -> Stage | None:
    """Этап режима по коду; для неизвестного кода — None (сервис отвечает 404)."""
    return _STAGE_INDEX[_check_mode(mode)].get(stage_id)


def stage_for_rule(mode: str, rule_id: str | None) -> Stage:
    """Этап, к которому относится правило в режиме. Неизвестное правило и `None` → «Прочее»."""
    checked = _check_mode(mode)
    if rule_id is None:
        return _STAGE_INDEX[checked][OTHER_STAGE_ID]
    return _RULE_STAGE[checked].get(rule_id, _STAGE_INDEX[checked][OTHER_STAGE_ID])


def rule_plain(rule_id: str | None) -> str:
    """Простая формулировка правила; для неизвестного правила и `None` — нейтральный фолбэк."""
    if rule_id is None:
        return UNKNOWN_RULE_PLAIN
    return RULE_PLAIN.get(rule_id, UNKNOWN_RULE_PLAIN)


def chain_from(mode: str, stage_id: str) -> tuple[ChainLink, ...]:
    """Связи, исходящие из этапа (только вперёд). Неизвестный этап — KeyError, а не пустой ответ."""
    checked = _check_mode(mode)
    if stage_id not in _STAGE_INDEX[checked]:
        raise KeyError(f"неизвестный этап {stage_id!r} в режиме {checked}")
    return tuple(link for link in CHAINS[checked] if link.source == stage_id)
