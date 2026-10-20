"""Ручные службы карточки 112: «×» на плитке (serviceRemoved) убирает службу из списка оповещения."""

from app.services.operator112_service import draft_from_events


def _event(type_: str, service_id: str) -> dict:
    return {"type": type_, "payload": {"serviceId": service_id}}


def test_removed_service_leaves_manual_list() -> None:
    events = [
        _event("serviceAdded", "svc-fsb"),
        _event("serviceAdded", "svc-evazhd"),
        _event("serviceRemoved", "svc-evazhd"),
        _event("serviceRemoved", "svc-evazhd"),
        _event("serviceAdded", "svc-zemp"),
    ]
    assert draft_from_events(events)["manual"] == [{"serviceId": "svc-fsb"}, {"serviceId": "svc-zemp"}]


def test_service_added_again_after_removal() -> None:
    events = [_event("serviceAdded", "svc-101"), _event("serviceRemoved", "svc-101"), _event("serviceAdded", "svc-101")]
    assert draft_from_events(events)["manual"] == [{"serviceId": "svc-101"}]
