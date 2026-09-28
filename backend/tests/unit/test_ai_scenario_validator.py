"""Структурные проверки кода, адреса, действия и профиля ДДС."""

from __future__ import annotations

from ml.generate.validator import validate_ai_scenario

RULES = ["ticket:ticket-1:1", "classifier:14080101", "address:local-directory"]
ENTRY = {"code": "14080101", "group": "Дерево"}
ADDRESS = "Москва, Чертановская улица, 58 корп. 2"


def _actions(*names: str) -> list[dict[str, object]]:
    return [{"action": name, "sourceRef": [RULES[0]]} for name in names]


def test_допустимый_код_адрес_порядок_и_профиль_проходят() -> None:
    errors = validate_ai_scenario(
        {"group": "Дерево", "classifierCode": ENTRY["code"], "address": ADDRESS, "expectedServices": ["101 (главная)"]},
        _actions("openCard:c-001", "status:accepted", "call:101", "status:workDone"),
        mode="dds",
        classifier_entries=[ENTRY],
        profile_groups={"Дерево"},
        rule_source_ids=RULES,
        address_allowlist={ADDRESS.casefold()},
    )

    assert errors == []


def test_неверный_код_адрес_профиль_и_порядок_возвращают_точные_причины() -> None:
    errors = validate_ai_scenario(
        {"group": "Пожар", "classifierCode": "99999999", "address": "Москва, несуществующая улица, 1"},
        _actions("status:workDone", "openCard:c-001", "status:accepted"),
        mode="dds",
        classifier_entries=[ENTRY],
        profile_groups={"Дерево"},
        rule_source_ids=RULES,
        address_allowlist={ADDRESS.casefold()},
    )

    assert {error["code"] for error in errors} >= {
        "unknown_classifier_code",
        "address_not_in_directory",
        "dds_profile_not_allowed",
        "invalid_action_order",
        "missing_open_card",
    }


def test_режим_112_требует_порядок_заполнения_карточки() -> None:
    valid = _actions("captureCaller", "captureAddress", "classify", "notify:101", "submit")
    invalid = _actions("captureAddress", "captureCaller", "submit")

    assert validate_ai_scenario(
        {"group": "Дерево", "classifierCode": ENTRY["code"], "address": ADDRESS},
        valid,
        mode="operator112",
        classifier_entries=[ENTRY],
        profile_groups={"Дерево"},
        rule_source_ids=RULES,
        address_allowlist={ADDRESS.casefold()},
    ) == []
    errors = validate_ai_scenario(
        {"group": "Дерево", "classifierCode": ENTRY["code"], "address": ADDRESS},
        invalid,
        mode="operator112",
        classifier_entries=[ENTRY],
        profile_groups={"Дерево"},
        rule_source_ids=RULES,
        address_allowlist={ADDRESS.casefold()},
    )
    assert any(error["code"] == "invalid_operator_action_order" for error in errors)
