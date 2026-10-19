"""Схемы карты ошибок (спека 003, T008): camelCase на проводе, сохранение обязательных null, валидация ErrorMapSettings."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.error_map import (
    ErrorMapChainLink,
    ErrorMapExplanation,
    ErrorMapResponse,
    ErrorMapSettings,
    ErrorMapStage,
    ErrorMapStageDetail,
    ErrorMapStageLevel,
)

SETTINGS: dict[str, object] = {
    "sometimesFrom": 0.10,
    "oftenFrom": 0.30,
    "minAttemptsGroup": 5,
    "minAttemptsStudent": 3,
    "sameBandPoints": 10,
}


def test_level_keeps_required_null_share_and_drops_absent_comparison():
    level = ErrorMapStageLevel(stage_id="intake", attempts=0, attempts_with_error=0, share=None, level="noData", affected_students=0)

    assert level.dump() == {
        "stageId": "intake",
        "attempts": 0,
        "attemptsWithError": 0,
        "share": None,
        "level": "noData",
        "affectedStudents": 0,
    }


def test_level_keeps_comparison_when_set():
    level = ErrorMapStageLevel.model_validate(
        {"stageId": "address", "attempts": 10, "attemptsWithError": 4, "share": 0.4, "level": "often", "comparison": "worse", "affectedStudents": 2}
    )

    assert level.dump()["comparison"] == "worse"
    assert level.dump()["share"] == 0.4


def test_nested_optional_none_is_dropped_and_group_scope_has_no_student_id():
    response = ErrorMapResponse.model_validate(
        {
            "scope": {"kind": "group", "groupId": "g-1", "title": "Группа 1"},
            "mode": "dds",
            "period": "1m",
            "attempts": 0,
            "stages": [],
            "levels": [],
            "headline": {"kind": "noData", "stageIds": [], "text": "Мало данных"},
            "generatedAt": "2026-10-19T10:00:00+03:00",
        }
    )

    dumped = response.dump()

    assert dumped["scope"] == {"kind": "group", "groupId": "g-1", "title": "Группа 1"}
    assert dumped["generatedAt"] == "2026-10-19T10:00:00+03:00"


def test_chain_link_uses_from_alias_both_ways():
    link = ErrorMapChainLink.model_validate({"from": "decision", "to": "services", "caption": "Неверный тип → не те службы"})

    assert link.from_ == "decision"
    assert link.dump() == {"from": "decision", "to": "services", "caption": "Неверный тип → не те службы"}
    assert ErrorMapChainLink(from_="a", to="b", caption="c").dump()["from"] == "a"


def test_stage_detail_keeps_required_null_explanation_and_drops_absent_verdict():
    detail = ErrorMapStageDetail(
        stage=ErrorMapStage(id="intake", order=1, title="Приём вызова"),
        level=ErrorMapStageLevel(stage_id="intake", attempts=0, attempts_with_error=0, share=None, level="noData", affected_students=0),
        typical_errors=[],
        chain=[],
        explanation=None,
    )

    dumped = detail.dump()

    assert "explanation" in dumped and dumped["explanation"] is None
    assert "articleId" not in dumped["stage"]

    explained = ErrorMapStageDetail(
        stage=ErrorMapStage(id="type", order=5, title="Тип по классификатору", article_id="kb-07"),
        level=ErrorMapStageLevel(stage_id="type", attempts=10, attempts_with_error=3, share=0.3, level="sometimes", affected_students=2),
        typical_errors=[],
        chain=[],
        explanation=ErrorMapExplanation(text="Тип не совпадает с классификатором.", source="template", text_hash="h1"),
    )

    assert explained.dump()["explanation"] == {"text": "Тип не совпадает с классификатором.", "source": "template", "textHash": "h1"}
    assert explained.dump()["stage"]["articleId"] == "kb-07"


def test_settings_accepts_default_values_in_camel_case():
    settings = ErrorMapSettings.model_validate(SETTINGS)

    assert settings.dump() == SETTINGS


@pytest.mark.parametrize(
    "overrides",
    [
        {"sometimesFrom": 0.01, "oftenFrom": 0.99},
        {"sameBandPoints": 0},
        {"sameBandPoints": 50},
        {"minAttemptsGroup": 1, "minAttemptsStudent": 1},
    ],
)
def test_settings_accepts_boundaries(overrides):
    ErrorMapSettings.model_validate({**SETTINGS, **overrides})


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"sometimesFrom": 0}, "Порог «иногда» должен быть больше 0"),
        ({"sometimesFrom": 0.3, "oftenFrom": 0.3}, "Порог «часто» должен быть больше порога «иногда»"),
        ({"sometimesFrom": 0.4, "oftenFrom": 0.3}, "Порог «часто» должен быть больше порога «иногда»"),
        ({"oftenFrom": 1}, "Порог «часто» должен быть меньше 1"),
        ({"sometimesFrom": True}, "Пороги светофора — числа от 0 до 1"),
        ({"minAttemptsGroup": 0}, "Минимум попыток — целое число не меньше 1"),
        ({"minAttemptsStudent": 2.5}, "Минимум попыток — целое число не меньше 1"),
        ({"sameBandPoints": 51}, "Допуск «как у группы» — от 0 до 50 баллов"),
        ({"sameBandPoints": -1}, "Допуск «как у группы» — от 0 до 50 баллов"),
    ],
)
def test_settings_rejects_with_russian_message(overrides, message):
    with pytest.raises(ValidationError) as excinfo:
        ErrorMapSettings.model_validate({**SETTINGS, **overrides})

    assert message in str(excinfo.value)
