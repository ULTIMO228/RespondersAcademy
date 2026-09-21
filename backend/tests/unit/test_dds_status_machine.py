import json
from pathlib import Path

import pytest

from app.config import get_settings
from app.services.status_machine import StatusMachine, StatusTransitionError, dds_machine


def _defs():
    reference = json.loads((get_settings().seed_dir / "spec" / "mocks" / "reference.json").read_text(encoding="utf-8"))
    return reference["ddsStatuses"], reference["serviceStatuses"]


def _expect(action, code):
    with pytest.raises(StatusTransitionError) as info:
        action()
    assert info.value.code == code
    return info.value


def test_graph_matches_reference():
    dds_defs, service_defs = _defs()
    machine = StatusMachine(dds_defs)
    for definition in dds_defs:
        for target in dds_defs:
            assert machine.can_transition(definition["status"], target["status"]) == (target["status"] in definition["next"])
    assert len(StatusMachine(service_defs).statuses) == 9
    assert StatusMachine(service_defs).initial_statuses == ["added"]


def test_primary_and_final():
    dds = dds_machine(_defs()[0])
    assert dds.next_statuses(None) == ["accepted", "notAccepted"]
    assert not dds.can_transition(None, "workDone")
    _expect(lambda: dds.assert_transition(None, "arrived"), "invalidTransition")
    assert dds.is_final("workDone")
    error = _expect(lambda: dds.assert_transition("workDone", "accepted"), "invalidTransition")
    assert error.message == "Переход из «Работы завершены» в «Принята» недопустим. Доступно: нет"
    assert dds.can_transition("notAccepted", "accepted")


@pytest.mark.parametrize("status,source", [("notAccepted", None), ("workRefused", "workInProgress")])
def test_requires_comment(status, source):
    dds = dds_machine(_defs()[0])
    assert dds.requires_comment(status)
    error = _expect(lambda: dds.assert_transition(source, status, "  "), "commentRequired")
    assert "обязателен комментарий" in error.message
    assert error.to_api_error().status == 400
    dds.assert_transition(source, status, "Вне компетенции")


def test_unknown_status():
    dds = dds_machine(_defs()[0])
    error = _expect(lambda: dds.assert_transition("accepted", "flying"), "unknownStatus")
    assert error.to_api_error().code == "validationFailed"
    assert _expect(lambda: dds.assert_transition("accepted", "arrived"), "invalidTransition").to_api_error().status == 409
