"""Локальный голосовой вызов: доступ, идемпотентность и сбой между LLM и озвучкой."""
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.api.errors import ApiError
from app.config import get_settings
from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.session import Attempt
from app.services import live_call_service as service
from app.services.time import now_iso
from tests.conftest import login_as


class FakeProvider:
    replies = 0
    fail_tts = False
    text = "Назовите адрес"

    def ready(self):
        pass

    def transcribe(self, audio):
        return self.text

    def reply(self, facts, transcript):
        assert "expectedServices" not in facts
        assert "addressRefined" not in facts
        assert transcript[-1]["speaker"] == "dispatcher"
        self.replies += 1
        return "Улица Грина, номер дома не знаю."

    def synthesize(self, text, path: Path):
        if self.fail_tts:
            raise ApiError(503, "internal", "Ошибка озвучки")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"RIFF-test-audio")


@pytest_asyncio.fixture
async def live(app, monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "live_calls_enabled", True)
    monkeypatch.setattr(settings, "var_dir", tmp_path)
    provider = FakeProvider()
    monkeypatch.setattr(service, "get_provider", lambda: provider)
    identifier = "att-" + uuid4().hex[:10]
    asg = "asg-" + uuid4().hex[:10]
    async with get_sessionmaker()() as db:
        db.add(Assignment(id=asg, teacher_id="u-002", student_ids=["u-005"], card_ids=["c-010"],
                          training_mode="operator112", format="training", state="active", created_at=now_iso()))
        db.add(Attempt(id=identifier, student_id="u-005", session_id="", card_id="c-010", mode="operator112",
                       opened_at=now_iso(), answered_at=now_iso(), state="answered"))
        db.add(AssignmentAttempt(assignment_id=asg, student_id="u-005", card_id="c-010", attempt_id=identifier, state="answered"))
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client, f"/operator112/attempts/{identifier}/live-call", identifier, provider, asg
    async with get_sessionmaker()() as db:
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id == identifier))
        await db.execute(delete(Attempt).where(Attempt.id == identifier))
        await db.execute(delete(Assignment).where(Assignment.id == asg))
        await db.commit()


async def send(client, base, turn_id):
    return await client.post(base + "/turn", data={"turnId": turn_id}, files={"file": ("turn.wav", b"test", "audio/wav")})


async def test_dialogue_retry_and_finish(live):
    client, base, identifier, provider, _ = live
    await login_as(client, "student")
    first = await client.post(base)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "active" and "facts" not in first.json()
    assert (await client.post(base)).json() == first.json()
    turn_id = str(uuid4())
    result = await send(client, base, turn_id)
    assert result.status_code == 200, result.text
    assert len(result.json()["transcript"]) == 3
    assert (await send(client, base, turn_id)).json() == result.json()
    assert provider.replies == 1
    assert (await client.get(base + "/audio/" + turn_id)).content == b"RIFF-test-audio"
    assert (await client.get(base + "/audio/unknown")).status_code == 404
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, identifier)
        assert "facts" not in attempt.calls[0]
    ended = (await client.post(base + "/finish")).json()
    assert ended["status"] == "ended"
    assert (await client.post(base + "/finish")).json() == ended
    assert (await client.get(base)).json() == ended
    assert (await send(client, base, str(uuid4()))).status_code == 409
    await login_as(client, "teacher")
    assert (await client.get(base)).json() == ended


async def test_authorization(live):
    client, base, _, _, _ = live
    assert (await client.post(base)).status_code == 401
    await login_as(client, "student2")
    for suffix in ("", "/audio/intro"):
        assert (await client.get(base + suffix)).status_code == 403
    assert (await client.post(base)).status_code == 403
    assert (await client.post(base + "/finish")).status_code == 403
    await login_as(client, "teacher")
    assert (await client.post(base)).status_code == 403


@pytest.mark.parametrize("state", ["ringing", "submitted"])
async def test_requires_answered_attempt(live, state):
    client, base, identifier, _, _ = live
    await login_as(client, "student")
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, identifier)
        attempt.state = state
        await db.commit()
    assert (await client.post(base)).status_code == 409


async def test_exam_and_disabled(live, monkeypatch):
    client, base, _, _, asg = live
    await login_as(client, "student")
    monkeypatch.setattr(get_settings(), "live_calls_enabled", False)
    assert (await client.post(base)).status_code == 503
    monkeypatch.setattr(get_settings(), "live_calls_enabled", True)
    async with get_sessionmaker()() as db:
        assignment = await db.get(Assignment, asg)
        assignment.format = "exam"
        await db.commit()
    assert (await client.post(base)).status_code == 409


async def test_failed_tts_is_retryable_without_partial_transcript(live):
    client, base, _, provider, _ = live
    await login_as(client, "student")
    assert (await client.post(base)).status_code == 200
    provider.fail_tts = True
    turn_id = str(uuid4())
    assert (await send(client, base, turn_id)).status_code == 503
    assert len((await client.get(base)).json()["transcript"]) == 1
    provider.fail_tts = False
    assert (await send(client, base, turn_id)).status_code == 200
    assert len((await client.get(base)).json()["transcript"]) == 3


async def test_empty_speech_bad_uuid_and_expiration(live):
    client, base, identifier, provider, _ = live
    await login_as(client, "student")
    await client.post(base)
    assert (await send(client, base, "../not-a-turn")).status_code == 400
    provider.text = ""
    assert (await send(client, base, str(uuid4()))).status_code == 400
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, identifier)
        call = service.current(attempt)
        call["startedAt"] = "2020-01-01T00:00:00Z"
        await service.save(db, attempt, call)
    assert (await send(client, base, str(uuid4()))).status_code == 409
    assert (await client.get(base)).json()["status"] == "ended"


async def test_realtime_ticket_uses_existing_auth_and_hides_facts(live, monkeypatch):
    from app.services import realtime_call_service as realtime
    client, _, identifier, _, _ = live
    monkeypatch.setattr(get_settings(), "live_call_realtime_transport", "omni")
    path = f"/operator112/attempts/{identifier}/realtime"
    assert (await client.post(path)).status_code == 401
    await login_as(client, "student2")
    assert (await client.post(path)).status_code == 403
    await login_as(client, "student")
    monkeypatch.setattr(get_settings(), "live_call_realtime_url", None)
    assert (await client.get("/operator112/realtime/status")).json() == {"configured": False}
    assert (await client.post(path, headers={"Origin": "http://app"})).status_code == 503
    monkeypatch.setattr(get_settings(), "live_call_realtime_url", "ws://model/v1/realtime")
    monkeypatch.setattr(get_settings(), "live_call_public_ws_url", "ws://backend/api/v1/operator112/realtime")
    assert (await client.post(path)).status_code == 400
    result = await client.post(path, headers={"Origin": "http://app"})
    assert result.status_code == 200, result.text
    assert set(result.json()) == {"url", "ticket"}
    ticket = realtime.consume_ticket(result.json()["ticket"], "http://app")
    await realtime.authorized(ticket)
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, identifier)
        attempt.state = "submitted"
        await db.commit()
    from app.api.errors import ApiError
    with pytest.raises(ApiError):
        await realtime.authorized(ticket)
