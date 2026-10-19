import asyncio
import io
import json
import wave

import httpx
import numpy as np
import pytest
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from app.services import realtime_call_service as call
from app.services import realtime_polza as polza


@pytest.fixture
def settings(monkeypatch):
    settings = get_settings()
    for name, value in {
        "polza_api_key": SecretStr("dummy-key"), "polza_base_url": "https://polza.example/api/v1",
        "live_call_polza_chat_model": "vendor/open-chat", "live_call_polza_stt_model": "vendor/open-asr",
        "live_call_polza_tts_model": "vendor/open-tts", "live_call_polza_tts_voice": "voice-1",
        "live_call_polza_tts_format": "wav", "live_call_polza_tts_instructions": True,
        "live_call_realtime_transport": "polza", "live_call_sounds_dir": None,
    }.items():
        monkeypatch.setattr(settings, name, value)
    return settings


def _wav24(samples: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(24000)
        target.writeframes(b"\x10\x00" * samples)
    return buffer.getvalue()


def _session(handler) -> polza.PolzaSession:
    session = polza.PolzaSession()
    session.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return session


async def test_llm_goes_to_polza_with_configured_open_model(settings):
    session = polza.PolzaSession()
    url, key, model, provider = session.llm_endpoint()
    assert url == "https://polza.example/api/v1" and key.get_secret_value() == "dummy-key"
    assert model == "vendor/open-chat" and provider == "Polza.ai"


async def test_stt_sends_wav_and_returns_text(settings):
    seen = {}

    def handler(request):
        seen["path"], seen["auth"] = request.url.path, request.headers["Authorization"]
        seen["body"] = request.content
        return httpx.Response(200, json={"text": " Назовите адрес "})

    session = _session(handler)
    assert await session.transcribe(b"\0\0" * 1600) == "Назовите адрес"
    assert seen["path"] == "/api/v1/audio/transcriptions" and seen["auth"] == "Bearer dummy-key"
    assert b"vendor/open-asr" in seen["body"] and b"RIFF" in seen["body"]
    await session.client.aclose()


@pytest.mark.parametrize(("status", "expected"), [(401, "POLZA_API_KEY"), (402, "средств"), (429, "лимит"),
                                                  (404, "имя модели"), (500, "не ответил")])
async def test_provider_errors_are_readable_and_hide_body(settings, status, expected):
    session = _session(lambda _: httpx.Response(status, text="account 12345 private"))
    with pytest.raises(ApiError, match=expected) as error:
        await session.transcribe(b"\0\0" * 1600)
    assert "12345" not in error.value.message
    await session.client.aclose()


async def test_tts_sends_emotion_and_voice_and_returns_pcm24(settings):
    bodies = []

    def handler(request):
        assert request.url.path == "/api/v1/audio/speech"
        bodies.append(json.loads(request.content))
        return httpx.Response(200, content=_wav24(240))

    session = _session(handler)
    phrases: asyncio.Queue = asyncio.Queue()
    for item in ("[паника] Помогите! [пауза]", "Горит балкон.", None):
        await phrases.put(item)
    chunks = [chunk async for chunk in session.synthesize(phrases)]
    # речь, тишина от [пауза], снова речь; метки в TTS не уходят
    assert [len(chunk) for chunk in chunks] == [480, 24000, 480]
    assert [body["input"] for body in bodies] == ["Помогите!", "Горит балкон."]
    assert all(body["model"] == "vendor/open-tts" and body["voice"] == "voice-1" for body in bodies)
    assert all("панике" in body["instructions"] for body in bodies)  # настроение держится между фразами
    await session.client.aclose()


async def test_tts_instructions_can_be_disabled(settings, monkeypatch):
    monkeypatch.setattr(settings, "live_call_polza_tts_instructions", False)
    monkeypatch.setattr(settings, "live_call_polza_tts_voice", None)
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, content=_wav24(10))

    session = _session(handler)
    await session.tts("Да.")
    assert set(bodies[0]) == {"model", "input", "response_format"}
    await session.client.aclose()


async def test_utterance_is_cut_by_silence_and_sent_once_to_stt(settings, monkeypatch):
    monkeypatch.setattr(settings, "live_call_end_silence_ms", 300)
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json={"text": "Что случилось?"})

    class Detector:
        def push(self, pcm):
            return 0.99 if np.abs(np.frombuffer(pcm, dtype="<i2")).max() > 100 else 0.01

    session = _session(handler)
    session.detector = Detector()
    responded = asyncio.Event()

    async def respond(initial=False):
        responded.set()
        await asyncio.Future()

    monkeypatch.setattr(session, "respond", respond)
    session.listener = asyncio.create_task(session.listen())
    speech = (np.ones(1600, dtype=np.int16) * 3000).astype("<i2").tobytes()  # 100 мс речи
    for _ in range(5):
        await session.audio.put(speech)
    for _ in range(5):
        await session.audio.put(b"\0" * 3200)  # 500 мс тишины
    await asyncio.wait_for(responded.wait(), 2)
    assert calls == ["/api/v1/audio/transcriptions"]
    assert session.history == [{"role": "user", "content": "Что случилось?"}]
    events = [session.events.get_nowait()["type"] for _ in range(session.events.qsize())]
    assert events[:2] == ["input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"]
    assert "conversation.item.input_audio_transcription.completed" in events
    await session.__aexit__()


async def test_short_click_is_not_sent_to_stt(settings, monkeypatch):
    monkeypatch.setattr(settings, "live_call_end_silence_ms", 300)
    calls = []
    session = _session(lambda request: calls.append(request) or httpx.Response(200, json={"text": "x"}))

    class Detector:
        def push(self, pcm):
            return 0.99 if np.abs(np.frombuffer(pcm, dtype="<i2")).max() > 100 else 0.01

    session.detector = Detector()
    session.listener = asyncio.create_task(session.listen())
    await session.audio.put((np.ones(1600, dtype=np.int16) * 3000).astype("<i2").tobytes())
    for _ in range(6):
        await session.audio.put(b"\0" * 3200)
    for _ in range(100):
        if session.audio.empty() and not session.speaking:
            break
        await asyncio.sleep(0.01)
    await asyncio.sleep(0.05)
    assert calls == []
    await session.__aexit__()


async def test_caller_text_shown_to_operator_has_no_tags(settings, monkeypatch):
    async def tokens(*_args):
        for token in ("[тре", "вожно] Алло, ", "[вздох] у нас пожар!"):
            yield token

    monkeypatch.setattr("app.services.realtime_cascade.stream_reply", tokens)
    session = _session(lambda _: httpx.Response(200, content=_wav24(10)))
    await session.respond(initial=True)
    events = [session.events.get_nowait() for _ in range(session.events.qsize())]
    shown = "".join(event["delta"] for event in events if event["type"] == "response.text.delta")
    assert shown == "Алло, у нас пожар!"
    assert session.history[-1]["content"].startswith("[тревожно]")  # модели история с метками
    await session.client.aclose()


def test_polza_needs_key_and_all_three_models(settings, monkeypatch):
    monkeypatch.setattr(polza.vad, "model_path", lambda: type("P", (), {"exists": lambda self: True})())
    monkeypatch.setattr(polza.importlib.util, "find_spec", lambda _name: object())
    assert polza.configured()
    monkeypatch.setattr(settings, "live_call_polza_tts_model", None)
    assert not polza.configured()
    monkeypatch.setattr(settings, "live_call_polza_tts_model", "vendor/open-tts")
    monkeypatch.setattr(settings, "polza_api_key", None)
    assert not polza.configured()


def test_polza_prompt_allows_emotion_tags_but_plain_prompt_forbids_them():
    created = {"session": {"capabilities": {"turn_detection": ["server_vad"]}}}
    from app.services.caller_persona import STYLE

    lively = call.session_update(created, {"summary": "пожар"}, STYLE)["session"]["instructions"]
    plain = call.session_update(created, {"summary": "пожар"})["session"]["instructions"]
    assert "[вздох]" in lively and "сценические ремарки" not in lively
    assert "сценические ремарки" in plain and "[вздох]" not in plain
