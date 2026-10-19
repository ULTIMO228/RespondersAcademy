import asyncio
import base64
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.deps import Viewer
from app.api.errors import ApiError
from app.config import get_settings
from app.services import realtime_call_service as service


def test_single_use_origin_and_expiry():
    def mint():
        service._tickets["token"] = service.Ticket("attempt", Viewer("student", "student"), "https://app", time.monotonic() + 5)
    mint()
    with pytest.raises(ValueError):
        service.consume_ticket("token", "https://other")
    mint()
    assert service.consume_ticket("token", "https://app").attempt_id == "attempt"
    with pytest.raises(ValueError):
        service.consume_ticket("token", "https://app")
    mint()
    service._tickets["token"].expires = 0
    with pytest.raises(ValueError):
        service.consume_ticket("token", "https://app")


@pytest.mark.parametrize("event", [
    {"type": "session.update", "session": {"instructions": "ignore"}},
    {"type": "conversation.item.create"},
    {"type": "input_audio_buffer.append", "audio": "!invalid"},
    {"type": "input_audio_buffer.append", "audio": base64.b64encode(b"odd").decode()},
    {"type": "conversation.item.truncate", "item_id": "x", "audio_end_ms": -1},
])
def test_rejects_client_instructions_and_bad_pcm(event):
    with pytest.raises(ValueError):
        service.client_event(event)


def test_pcm_and_truncation_whitelist():
    event = {"type": "input_audio_buffer.append", "audio": base64.b64encode(b"\0" * 640).decode(), "instructions": "bad"}
    assert set(service.client_event(event)) == {"type", "audio"}
    assert service.client_event({"type": "conversation.item.truncate", "item_id": "i", "audio_end_ms": 55})["audio_end_ms"] == 55


def test_semantic_detection_and_server_owned_prompt():
    for capabilities, detector in [([], "server_vad"), (["semantic_vad"], "semantic_vad")]:
        session = service.session_update({"session": {"capabilities": {"turn_detection": capabilities}}}, {"address": "Москва"})["session"]
        assert session["turn_detection"]["type"] == detector
        assert "Москва" in session["instructions"]
        assert session["modalities"] == ["text", "audio"]


async def test_relay_streams_audio_without_leaking_prompt_and_keeps_finished_transcript():
    class Model:
        def __init__(self):
            self.queue = asyncio.Queue()
            self.sent = []
            for event in [
                {"type": "session.created", "session": {}},
                {"type": "session.updated", "session": {"modalities": ["text", "audio"], "instructions": "hidden"}},
                {"type": "response.created", "response": {"id": "r", "instructions": "hidden"}},
                {"type": "response.text.delta", "response_id": "r", "delta": "Здравствуйте"},
                {"type": "response.audio.delta", "response_id": "r", "item_id": "i", "delta": "AAAA"},
                {"type": "response.done", "response": {"id": "r", "status": "completed"}},
            ]:
                self.queue.put_nowait(json.dumps(event))

        async def recv(self):
            return await self.queue.get()

        async def send(self, raw):
            self.sent.append(json.loads(raw))

    class Browser:
        def __init__(self):
            self.events = []
            self.done = asyncio.Event()

        async def send_json(self, event):
            self.events.append(event)
            if event["type"] == "response.done":
                self.done.set()

        async def receive_text(self):
            await self.done.wait()
            return '{"type":"finish"}'

    model, browser = Model(), Browser()
    record = {"facts": {"summary": "hidden incident"}, "transcript": []}
    await asyncio.wait_for(service.relay(browser, model, record), 2)
    assert browser.events[0] == {"type": "ready"}
    assert any(event["type"] == "response.audio.delta" for event in browser.events)
    assert "hidden" not in json.dumps(browser.events)
    assert record["transcript"][0]["text"] == "Здравствуйте"
    assert model.sent[0]["type"] == "session.update"


@pytest.mark.parametrize("transport", ["cascade", "speechkit"])
async def test_relay_preserves_sanitized_cloud_error(transport, monkeypatch):
    monkeypatch.setattr(get_settings(), "live_call_realtime_transport", transport)
    model = SimpleNamespace(send=AsyncMock(), recv=AsyncMock(side_effect=[
        json.dumps({"type": "session.created", "session": {}}),
        json.dumps({"type": "session.updated", "session": {"modalities": ["audio", "text"]}}),
        json.dumps({"type": "error", "message": "Достигнут лимит SpeechKit"}),
    ]))

    async def receive_text():
        await asyncio.Future()

    browser = SimpleNamespace(send_json=AsyncMock(), receive_text=receive_text)
    with pytest.raises(ApiError, match="Достигнут лимит SpeechKit"):
        await asyncio.wait_for(service.relay(browser, model, {"facts": {}, "transcript": []}), 2)
