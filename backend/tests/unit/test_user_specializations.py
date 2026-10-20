"""T005 (фича 007): поле `User.specializations` — правила по роли и публичный вид `to_public()`."""

from __future__ import annotations

import pytest

from app.models.user import SPECIALIZATIONS, User, normalize_specializations


def _user(role: str, specializations: list[str] | None) -> User:
    return User(id="u-t", login="tester", password_hash="x", full_name="Тестовый", role=role, arm_number=1, specializations=specializations)


def test_public_view_carries_student_specializations():
    assert _user("student", ["operator112", "dds"]).to_public()["specializations"] == ["operator112", "dds"]


def test_public_view_omits_specializations_when_absent():
    assert "specializations" not in _user("teacher", None).to_public()
    assert "specializations" not in _user("admin", None).to_public()


def test_vocabulary_is_the_project_training_modes():
    assert SPECIALIZATIONS == ("operator112", "dds")


@pytest.mark.parametrize("value", [["dds"], ["operator112"], ["operator112", "dds"]])
def test_student_accepts_one_or_both_specializations(value: list[str]):
    assert normalize_specializations("student", value) == value


@pytest.mark.parametrize("value", [[], None, ["dds", "dds"], ["operator112", "pilot"], "dds", [1]])
def test_student_rejects_empty_duplicate_or_unknown_values(value):
    with pytest.raises(ValueError):
        normalize_specializations("student", value)


@pytest.mark.parametrize("role", ["teacher", "admin"])
def test_staff_has_no_specializations(role: str):
    assert normalize_specializations(role, None) is None
    assert normalize_specializations(role, []) is None
    with pytest.raises(ValueError):
        normalize_specializations(role, ["dds"])
