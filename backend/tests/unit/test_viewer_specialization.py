"""T007 (фича 007): `Viewer.has_specialization(mode)` — учитель и администратор проходят, обучающийся — по списку."""

from __future__ import annotations

import pytest

from app.api.deps import Viewer


@pytest.mark.parametrize("role", ["teacher", "admin"])
def test_staff_passes_every_zone(role: str):
    viewer = Viewer(user_id="u-staff", role=role)
    assert all(viewer.has_specialization(mode) for mode in ("operator112", "dds", "chain"))


def test_student_needs_the_matching_specialization():
    dds = Viewer(user_id="u-007", role="student", specializations=("dds",))
    assert dds.has_specialization("dds") is True
    assert dds.has_specialization("operator112") is False


def test_chain_requires_both_specializations():
    both = Viewer(user_id="u-005", role="student", specializations=("operator112", "dds"))
    assert both.has_specialization("chain") and both.has_specialization("operator112") and both.has_specialization("dds")
    only_112 = Viewer(user_id="u-016", role="student", specializations=("operator112",))
    assert only_112.has_specialization("operator112") is True
    assert only_112.has_specialization("chain") is False


def test_student_without_specializations_has_no_zone():
    empty = Viewer(user_id="u-009", role="student")
    assert not any(empty.has_specialization(mode) for mode in ("operator112", "dds", "chain"))


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        Viewer(user_id="u-007", role="student", specializations=("dds",)).has_specialization("assessment")
