"""Ядро карты ошибок (T013): эталон с вручную посчитанными значениями (SC-005).

Ожидаемые числа записаны в тестах как константы, посчитанные на бумаге; код для их получения не вызывается.
"""

from __future__ import annotations

import pytest

from app.services.error_map_service import AttemptErrors, compute_stage_levels
from app.services.error_map_settings import ErrorMapSettings

SETTINGS = ErrorMapSettings()  # 0,10 / 0,30


def attempt(n: int, rules: list[str | None], *, student: str = "u-1", mode: str = "dds") -> AttemptErrors:
    return AttemptErrors(
        attempt_id=f"att-{n:03d}",
        student_id=student,
        mode=mode,
        at="2026-10-01T10:00:00+03:00",
        errors=[{"ruleId": rule} if rule else {"type": "timeLimit"} for rule in rules],
    )


def by_stage(results):
    return {r.stage.id: r for r in results}


def test_boundaries_10_and_30_percent_are_sometimes():
    # 10 попыток: «Адрес» (a1) в №0 → 1/10; «Тип» (v2) в №0, №1, №2 → 3/10; «Карточка» (f1) в №3..№6 → 4/10.
    rules = {0: ["a1", "v2"], 1: ["v2"], 2: ["v2"], 3: ["f1"], 4: ["f1"], 5: ["f1"], 6: ["f1"]}
    attempts = [attempt(i, rules.get(i, [])) for i in range(10)]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=5))
    assert r["address"].attempts_with_error == 1 and r["address"].share == pytest.approx(0.10)
    assert r["address"].level == "sometimes"  # ровно 10% — «иногда»
    assert r["decision"].attempts_with_error == 3 and r["decision"].share == pytest.approx(0.30)
    assert r["decision"].level == "sometimes"  # ровно 30% — «иногда»
    assert r["card"].attempts_with_error == 4 and r["card"].level == "often"  # 40%
    assert r["services"].attempts_with_error == 0 and r["services"].level == "rare"
    assert all(x.attempts == 10 for x in r.values())


def test_just_below_ten_percent_is_rare():
    # 20 попыток, 1 ошибка на этапе «Адрес» → 5%
    attempts = [attempt(i, ["a2"] if i == 0 else []) for i in range(20)]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=5))
    assert r["address"].share == pytest.approx(0.05)
    assert r["address"].level == "rare"


def test_several_errors_on_one_stage_count_once_per_attempt():
    # 5 попыток; в первой три разных правила этапа «Адрес» и одно «Карточка»; во второй a1 дважды
    attempts = [
        attempt(1, ["a1", "a2", "a3", "f1"]),
        attempt(2, ["a1", "a1"], student="u-2"),
        attempt(3, []),
        attempt(4, []),
        attempt(5, []),
    ]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=5))
    assert r["address"].attempts_with_error == 2  # не 5
    assert r["address"].share == pytest.approx(0.4)
    assert r["address"].affected_students == 2
    assert r["card"].attempts_with_error == 1 and r["card"].affected_students == 1
    assert r["card"].share == pytest.approx(0.2)


def test_attempt_without_errors_counts_in_denominator_only():
    attempts = [attempt(1, ["d1"]), attempt(2, []), attempt(3, []), attempt(4, [])]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4))
    assert r["services"].attempts == 4
    assert r["services"].share == pytest.approx(0.25)
    assert r["intake"].share == 0.0 and r["intake"].level == "rare"


def test_unmapped_rule_goes_to_other():
    # неизвестное правило «zz9» и op-правило в режиме ДДС → «Прочее»; 4 попытки, в 2 такие ошибки
    attempts = [attempt(1, ["zz9"]), attempt(2, ["op-f1"]), attempt(3, []), attempt(4, [])]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4))
    assert r["other"].attempts_with_error == 2
    assert r["other"].share == pytest.approx(0.5)
    assert r["other"].level == "often"


def test_element_without_rule_id_goes_to_other():
    # 4 попытки; в одной только timeLimit (без ruleId), в другой timeLimit + x-правило этапа «Адрес»
    attempts = [attempt(1, [None]), attempt(2, [None, "a1"]), attempt(3, []), attempt(4, [])]
    r = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4))
    assert r["other"].attempts_with_error == 2 and r["other"].share == pytest.approx(0.5)
    assert r["address"].attempts_with_error == 1 and r["address"].share == pytest.approx(0.25)


def test_fewer_attempts_than_minimum_is_no_data_for_all():
    attempts = [attempt(1, ["a1"]), attempt(2, ["v2"]), attempt(3, [])]
    results = compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4)
    assert len(results) == 9  # 8 этапов + «Прочее»
    assert all(x.level == "noData" and x.share is None for x in results)
    assert all(x.attempts == 3 for x in results)
    # счётчики сохраняются: нужны для подписей
    assert by_stage(results)["address"].attempts_with_error == 1


def test_exactly_minimum_attempts_is_enough():
    attempts = [attempt(i, []) for i in range(5)]
    results = compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=5)
    assert all(x.level == "rare" and x.share == 0.0 for x in results)


def test_no_attempts_is_no_data():
    results = compute_stage_levels([], "dds", SETTINGS, min_attempts=1)
    assert all(x.level == "noData" and x.attempts == 0 for x in results)


def test_other_mode_is_filtered_out():
    # 4 попытки ДДС (в 1 — адрес) и 3 попытки специалиста-112 с ошибками — в расчёт ДДС не входят
    attempts = [attempt(1, ["a1"]), attempt(2, []), attempt(3, []), attempt(4, [])]
    attempts += [attempt(10 + i, ["op-f1"], mode="operator112") for i in range(3)]
    dds = by_stage(compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4))
    assert dds["address"].attempts == 4 and dds["address"].share == pytest.approx(0.25)
    assert dds["other"].attempts_with_error == 0
    op = compute_stage_levels(attempts, "operator112", SETTINGS, min_attempts=3)
    op_by = by_stage(op)
    assert op_by["type"].attempts == 3 and op_by["type"].share == 1.0 and op_by["type"].level == "often"


def test_same_rule_maps_to_different_stages_per_mode():
    # g1 — «Карточка» в ДДС, «Прочее» у специалиста-112
    dds = by_stage(compute_stage_levels([attempt(1, ["g1"])], "dds", SETTINGS, min_attempts=1))
    op = by_stage(compute_stage_levels([attempt(1, ["g1"], mode="operator112")], "operator112", SETTINGS, min_attempts=1))
    assert dds["card"].attempts_with_error == 1 and dds["other"].attempts_with_error == 0
    assert op["other"].attempts_with_error == 1


def test_sorting_share_desc_then_order_no_data_last():
    # 4 попытки: «Карточка» 3/4, «Адрес» 1/4 и «Статусы» 1/4, остальные 0
    attempts = [
        attempt(1, ["f1", "a1"]),
        attempt(2, ["f1", "v1"]),
        attempt(3, ["c1"]),
        attempt(4, []),
    ]
    ids = [x.stage.id for x in compute_stage_levels(attempts, "dds", SETTINGS, min_attempts=4)]
    assert ids[:3] == ["card", "address", "statuses"]  # 0,75; затем 0,25 по порядку этапов 2 и 7
    assert ids[3:] == ["intake", "decision", "services", "route", "closing", "other"]  # нули по order, «Прочее» последним
    none_data = compute_stage_levels(attempts[:1], "dds", SETTINGS, min_attempts=4)
    assert [x.stage.order for x in none_data] == [1, 2, 3, 4, 5, 6, 7, 8, 9]


def test_custom_thresholds_are_used():
    custom = ErrorMapSettings(sometimes_from=0.2, often_from=0.5)
    attempts = [attempt(1, ["a1"]), attempt(2, []), attempt(3, []), attempt(4, [])]  # 25%
    r = by_stage(compute_stage_levels(attempts, "dds", custom, min_attempts=4))
    assert r["address"].level == "sometimes"
