"""T033 (фича 007, US2): жизненный цикл карточки 112 через `/api/v1/operator112/*`.

Проверяет: «Сохранить» регистрирует карточку только с подтверждением списка оповещения (для исходов «нет контакта» /
«срыв» подтверждение не нужно); служба из списка сохраняется в карточке, а сама карточка уходит в банк ДДС, не в идущее
занятие (фича 011, D4); «Отработана» ставит только специалист 112; «Закрыть» разрешено из «Завершена» и не разрешено из
«Зарегистрирована»/«Закрыта»; правка списка оповещения (добавление службы — сохраняется, удаление автоназначенной — нет).

Каждый отказ (403/409) стоит рядом с парным запросом, который обязан вернуть 200/201. Расхождения с спекой
`spec/007-learner-role-split/spec.md` оформлены как `xfail(strict=True)` с причиной и НЕ подгоняются под код.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation, TrainingSession
from app.models.ticket_audio import TicketAudio
from app.services.time import now_iso

SPEC_MESSAGE = "Недоступно для вашей специализации"
TRAINING = "asg-001"  # ivanov (u-005) и petrova (u-006) — обе специализации; билет c-010 (пожар в жилом доме)
OWNER = {"login": "ivanov", "password": "student112"}
DDS_ONLY = {"login": "sidorova", "password": "student112"}  # u-007: только ДДС, служба «ДДС района Зюзино»
MOSGAZ_DDS = "u-009"  # только ДДС, служба «Мосгаз (учебный профиль)» — получает карточку со службой 104
TEACHER = {"login": "morozova", "password": "teacher112"}
SESSION_ID = "ses-t033-dds"

DRAFT: dict[str, Any] = {
    "notificationConfirmed": True,
    "applicant": {"name": "Сидорова Анна Викторовна", "status": "очевидец"},
    "phones": {"aon": "+7 (916) 126-34-71", "provided": "+7 (916) 126-34-71", "onSite": ""},
    "address": {"formal": "Россия, Москва, улица Грина, дом неизвестен, библиотека № 19", "street": "ул. Грина", "house": "", "source": "directory", "descriptive": "в доме библиотека № 19"},
    "what": {"pollAnswers": "Пожар, горит балкон и окна на 13 этаже", "signs": ["жилой дом", "балкон", "открытое пламя"], "finalType": "", "classifierCode": "1050201", "casualties": {"injured": False, "ambulanceRefused": False, "blocked": False}},
    "description": "Со слов заявителя: горит балкон и два окна на 13-м этаже, открытое пламя, наблюдают с улицы.",
    "emergency": {"chs": False, "chp": False},
    "notificationList": [],
}


@pytest_asyncio.fixture
async def http(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def _restore_state() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = list((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        if attempt_ids:
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin == "operator112"))
        await db.execute(delete(TicketAudio))
        await db.execute(delete(TrainingSession).where(TrainingSession.id == SESSION_ID))
        await db.execute(delete(AuditLog).where(AuditLog.action.in_(("card.noContact", "card.callDropped"))))
        await db.commit()


async def _login(http: AsyncClient, creds: dict[str, str]) -> None:
    response = await http.post("/api/mock/auth/login", json={"login": creds["login"], "password": creds["password"]})
    assert response.status_code == 200, response.text


def _draft(**overrides: Any) -> dict[str, Any]:
    return {**DRAFT, **overrides}


async def _answered_attempt(http: AsyncClient) -> str:
    """Вызов принят владельцем попытки (ivanov) по билету c-010."""
    await _login(http, OWNER)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    attempt_id = created.json()["id"]
    answered = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")
    assert answered.status_code == 200, answered.text
    return attempt_id


async def _card_of(attempt_id: str) -> IncidentCard:
    async with get_sessionmaker()() as db:
        return (await db.execute(select(IncidentCard).where(IncidentCard.source_attempt_id == attempt_id))).scalar_one()


async def test_save_registers_card_only_with_notification_confirmation(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    refused = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft(notificationConfirmed=False))
    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["code"] == "invalidTransition"
    async with get_sessionmaker()() as db:
        assert (await db.execute(select(IncidentCard).where(IncidentCard.source_attempt_id == attempt_id))).scalars().all() == []
        assert (await db.get(Attempt, attempt_id)).state == "answered"

    submitted = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft())
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["card"]["cardStatus"] == "registered"
    assert (await _card_of(attempt_id)).extra["cardStatus"] == "registered"
    async with get_sessionmaker()() as db:
        assert (await db.get(Attempt, attempt_id)).state == "submitted"


async def test_registered_card_goes_to_dds_bank_not_to_running_session(http: AsyncClient):
    """Адаптировано под фичу 011 (D4): сохранённая карточка 112 сама в идущее занятие ДДС не попадает, а ложится в банк."""
    async with get_sessionmaker()() as db:
        db.add(TrainingSession(id=SESSION_ID, teacher_id="u-002", student_ids=["u-007", MOSGAZ_DDS], scenario_ids=[], mode="practice",
                               card_source="studentCreated", card_flow=[], state="running", started_at=now_iso(), plan=None,
                               paused_at=None, parked=[], training_mode="dds", format="training", exam=None))
        await db.commit()
    attempt_id = await _answered_attempt(http)
    submitted = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft(notificationList=[{"serviceId": "svc-104", "addedBy": "auto"}]))
    assert submitted.status_code == 200, submitted.text
    card = await _card_of(attempt_id)
    assert card.expected_services == ["104"]  # служба из списка сохранена в карточке
    async with get_sessionmaker()() as db:
        flow = (await db.get(TrainingSession, SESSION_ID)).card_flow
    assert [item for item in flow if item["cardId"] == card.id] == []  # в идущее занятие карточка сама не выдаётся

    # Пара: карточка доступна в банке карточек обучающихся (оттуда её берёт преподаватель при настройке занятия ДДС).
    await _login(http, TEACHER)
    bank = await http.get("/api/v1/student-cards")
    assert bank.status_code == 200, bank.text
    assert any(row["id"] == card.id for row in bank.json())


async def test_outcome_in_draft_saves_without_confirmation_and_backend_appends_event(http: AsyncClient):
    """Исход «нет контакта» в черновике (спека 009 FR-017): подтверждение оповещения не требуется, событие дописывает сервер."""
    attempt_id = await _answered_attempt(http)
    refused = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft(notificationConfirmed=False))
    assert refused.status_code == 409, refused.text  # парный отказ: заполненная карточка без подтверждения не сохраняется

    saved = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft(outcome="noContact", notificationConfirmed=False))
    assert saved.status_code == 200, saved.text
    assert saved.json()["card"]["cardStatus"] == "completed"
    async with get_sessionmaker()() as db:
        events = (await db.get(Attempt, attempt_id)).events or []
    assert [event["type"] for event in events].count("noContact") == 1


async def test_processed_is_set_only_by_112_specialist_after_registration(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    too_early = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})
    assert too_early.status_code == 409, too_early.text  # до «Сохранить» отработки нет
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft())).status_code == 200

    await _login(http, DDS_ONLY)
    denied = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})
    assert denied.status_code == 403, denied.text
    assert denied.json()["error"]["message"] == SPEC_MESSAGE

    await _login(http, TEACHER)
    teacher = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})
    assert teacher.status_code == 403, teacher.text

    await _login(http, OWNER)
    marked = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})
    assert marked.status_code == 201, marked.text  # пара: тот же запрос специалиста 112 — 201
    assert (await _card_of(attempt_id)).extra["cardStatus"] == "processed"
    repeated = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})
    assert repeated.status_code == 409, repeated.text


async def test_close_is_allowed_from_completed_and_refused_from_registered(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft())).status_code == 200
    refused = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "close"})
    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["code"] == "invalidTransition"
    assert (await _card_of(attempt_id)).extra["cardStatus"] == "registered"

    # Пара: вызов без соединения даёт статус «Завершена» — закрытие разрешено.
    await _login(http, OWNER)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    completed_id = created.json()["id"]
    assert (await http.post(f"/api/v1/operator112/attempts/{completed_id}/events", json={"type": "noContact"})).status_code == 201
    assert (await http.post(f"/api/v1/operator112/attempts/{completed_id}/submit", json=_draft())).status_code == 200
    closed = await http.post(f"/api/v1/operator112/attempts/{completed_id}/events", json={"type": "close"})
    assert closed.status_code == 201, closed.text
    assert (await _card_of(completed_id)).extra["cardStatus"] == "closed"
    again = await http.post(f"/api/v1/operator112/attempts/{completed_id}/events", json={"type": "close"})
    assert again.status_code == 409, again.text


@pytest.mark.xfail(
    strict=True,
    reason="расхождение: spec.md:102 — закрытие только из «Создана/Завершена/Отменена»; код operator112_service.py:304 разрешает и «Отработана»",
)
async def test_close_after_processed_is_refused(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft())).status_code == 200
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "processed"})).status_code == 201
    closed = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "close"})
    assert closed.status_code == 409, closed.text


async def _auto_services(http: AsyncClient, attempt_id: str) -> list[str]:
    """Список оповещения строится по опросной карте из событий: признаки и код классификатора заполняются до чтения."""
    questionnaire = [
        {"type": "signSelected", "payload": {"signs": DRAFT["what"]["signs"]}},
        {"type": "fieldChanged", "payload": {"field": "what.classifierCode", "value": DRAFT["what"]["classifierCode"]}},
    ]
    for event in questionnaire:
        assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json=event)).status_code == 201
    listed = await http.get(f"/api/v1/operator112/attempts/{attempt_id}/notification-list")
    assert listed.status_code == 200, listed.text
    return [item["serviceId"] for item in listed.json()["services"] if item["addedBy"] == "auto"]


async def test_full_auto_notification_list_is_registered_as_listed(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    auto = await _auto_services(http, attempt_id)
    assert len(auto) >= 2, auto  # без двух автоматических служб проверка удаления бессмысленна
    submitted = await http.post(
        f"/api/v1/operator112/attempts/{attempt_id}/submit",
        json=_draft(notificationList=[{"serviceId": service, "addedBy": "auto"} for service in auto]),
    )
    assert submitted.status_code == 200, submitted.text
    assert len((await _card_of(attempt_id)).expected_services) == len(auto)


@pytest.mark.xfail(
    strict=True,
    reason="расхождение: spec.md:54 — автоматические службы «удалять нельзя»; submit принимает список без svc-101 и сохраняет карточку (200), operator112_service.py `_fill_notification_list` использует переданный список как есть; решение по удалению открыто (spec.md:36)",
)
async def test_auto_service_cannot_be_removed_from_notification_list(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    auto = await _auto_services(http, attempt_id)
    assert len(auto) >= 2, auto
    # Удаляем первую автоматическую службу (svc-101): сервер принимает список без неё и отвечает 200.
    removed = await http.post(
        f"/api/v1/operator112/attempts/{attempt_id}/submit",
        json=_draft(notificationList=[{"serviceId": service, "addedBy": "auto"} for service in auto[1:]]),
    )
    assert removed.status_code in (403, 409), removed.text


async def test_added_service_is_kept_in_registered_card(http: AsyncClient):
    attempt_id = await _answered_attempt(http)
    auto = await _auto_services(http, attempt_id)
    free = next(f"svc-10{n}" for n in range(1, 5) if f"svc-10{n}" not in auto)
    added = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "serviceAdded", "payload": {"serviceId": free}})
    # Контракт v1 (specs/002 contracts/v1-endpoints.md): события отвечают 201; задание T033 писало «200».
    assert added.status_code == 201, added.text
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=_draft())).status_code == 200
    assert free.removeprefix("svc-") in (await _card_of(attempt_id)).expected_services
    after = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "serviceAdded", "payload": {"serviceId": free}})
    assert after.status_code == 409, after.text  # после «Сохранить» список уже зафиксирован
