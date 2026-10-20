import asyncio
import json
import threading

import httpx
import numpy as np
import pytest
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from app.services import realtime_cascade as cascade


def test_phrase_split_starts_before_full_answer():
    assert cascade.take_phrase("Да, горит. Ещё дым") == ("Да, горит.", "Ещё дым")
    assert cascade.take_phrase("Ещё не закончил") == ("", "Ещё не закончил")
    assert cascade.take_phrase("слово " * 25) == ("", "слово " * 25)
    phrase, tail = cascade.take_phrase("слово " * 55)
    assert 100 < len(phrase) < 260 and tail


def test_tts_keeps_address_and_numbers_together_across_token_boundaries():
    assert cascade.take_phrase("Москва, ул.") == ("", "Москва, ул.")
    assert cascade.take_phrase("Москва, ул. Грина, д. 11.") == ("", "Москва, ул. Грина, д. 11.")
    phrase, tail = cascade.take_phrase("Москва, ул. Грина, д. 11. Пожалуйста, быстрее!")
    assert phrase == "Москва, ул. Грина, д. 11."
    assert tail == "Пожалуйста, быстрее!"
    assert cascade.take_phrase("Температура 37.")[0] == ""
    assert cascade.take_phrase("Температура 37.5, ему плохо. Помогите!")[0] == "Температура 37.5, ему плохо."


@pytest.fixture
def api_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "live_call_llm_url", "https://model.example/v1")
    monkeypatch.setattr(settings, "live_call_llm_api_key", SecretStr("dummy-key"))
    monkeypatch.setattr(settings, "live_call_llm_model", "qwen/qwen3.8-27b")
    return settings


async def test_actual_sse_contract_and_no_reasoning(api_settings):
    def handler(request):
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer dummy-key"
        body = json.loads(request.content)
        assert body["stream"] is True and body["reasoning_effort"] == "none"
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Да."}}]}\n\n'
                              'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert [delta async for delta in cascade.stream_reply([{"role": "user", "content": "Вопрос"}], client)] == ["Да."]


async def test_quota_error_is_readable_without_raw_body(api_settings):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(429, text="private details"))) as client:
        with pytest.raises(ApiError, match="лимит") as error:
            _ = [delta async for delta in cascade.stream_reply([], client)]
    assert "private" not in error.value.message


async def test_interrupted_history_coalesces_adjacent_user_messages(api_settings):
    messages = [{"role": "user", "content": "Адрес?"}, {"role": "user", "content": "Сколько пострадавших?"}]

    def handler(request):
        body = json.loads(request.content)
        assert len(body["messages"]) == 1
        assert "Адрес?" in body["messages"][0]["content"] and "Сколько пострадавших?" in body["messages"][0]["content"]
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Не знаю."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n')

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert [delta async for delta in cascade.stream_reply(messages, client)] == ["Не знаю."]
    assert len(messages) == 2  # сохранённая история не изменена форматированием API


async def test_cancel_during_synthesis_never_emits_late_audio(monkeypatch):
    started, release = threading.Event(), threading.Event()

    async def tokens(*_args):
        yield "В квартире дым."

    def synthesize(_text):
        started.set()
        release.wait(timeout=3)
        return b"\0" * 4800

    monkeypatch.setattr(cascade, "stream_reply", tokens)
    monkeypatch.setattr(cascade.tts, "synthesize_pcm", synthesize)
    session = cascade.CascadeSession()
    session.history = [{"role": "user", "content": "Что случилось?"}]
    session.response = asyncio.create_task(session.respond())
    try:
        assert await asyncio.to_thread(started.wait, 2)
        await session.cancel_response()
    finally:
        release.set()
    await asyncio.sleep(0.02)
    events = [session.events.get_nowait() for _ in range(session.events.qsize())]
    assert any(event["type"] == "response.done" and event["response"]["status"] == "cancelled" for event in events)
    assert not any(event["type"] == "response.audio.delta" for event in events)
    assert all(message["role"] == "user" for message in session.history)


async def test_session_starts_with_generated_caller_speech(monkeypatch):
    ready = asyncio.Event()
    session = cascade.CascadeSession()

    async def listen():
        await asyncio.Future()

    async def respond(initial=False):
        assert initial is True
        assert session.history == []
        ready.set()
        await asyncio.Future()

    monkeypatch.setattr(session, "listen", listen)
    monkeypatch.setattr(session, "respond", respond)
    await session.send(json.dumps({"type": "session.update", "session": {"instructions": "Факты билета"}}))
    await asyncio.wait_for(ready.wait(), 1)
    assert json.loads(await session.recv())["type"] == "session.updated"
    await session.__aexit__()


async def test_continuous_input_commits_after_speech_and_still_accepts_input(monkeypatch):
    class Recognizer:
        def AcceptWaveform(self, _pcm):
            return False

        def PartialResult(self):
            return '{"partial":"здравствуйте"}'

        def FinalResult(self):
            return '{"text":"здравствуйте"}'

        def Reset(self):
            pass

    session = cascade.CascadeSession()
    session.recognizer = Recognizer()
    class Detector:
        def push(self, pcm):
            return 0.99 if np.abs(np.frombuffer(pcm, dtype="<i2")).max() > 100 else 0.01
    session.detector = Detector()
    responded = asyncio.Event()

    async def respond():
        responded.set()
        await asyncio.Future()

    monkeypatch.setattr(session, "respond", respond)
    session.listener = asyncio.create_task(session.listen())
    speech = (np.ones(1600, dtype=np.int16) * 3000).astype("<i2").tobytes()
    await session.audio.put(speech)
    for _ in range(4):
        await session.audio.put(b"\0" * 3200)
    await asyncio.wait_for(responded.wait(), 2)
    assert session.history == [{"role": "user", "content": "здравствуйте"}]
    await session.audio.put(speech)
    for _ in range(100):
        if session.response is None:
            break
        await asyncio.sleep(0.01)
    assert session.response is None  # новая речь отменила отвечающую модель
    events = [session.events.get_nowait() for _ in range(session.events.qsize())]
    assert sum(event["type"] == "input_audio_buffer.speech_started" for event in events) == 2
    assert any(event["type"] == "input_audio_buffer.committed" for event in events)
    await session.__aexit__()


async def test_noise_does_not_cancel_caller_response():
    class Recognizer:
        def AcceptWaveform(self, _pcm):
            return False

        def PartialResult(self):
            return '{"partial":""}'

    class Detector:
        calls = 0

        def push(self, _pcm):
            self.calls += 1
            return 0.01  # громкий, но неречевой шум

    session = cascade.CascadeSession()
    session.recognizer, session.detector = Recognizer(), Detector()
    session.response = asyncio.create_task(asyncio.sleep(10))
    answering = session.response
    session.listener = asyncio.create_task(session.listen())
    for _ in range(6):
        await session.audio.put((np.ones(1600, dtype=np.int16) * 10000).tobytes())
    for _ in range(100):
        if session.detector.calls >= 6:
            break
        await asyncio.sleep(0.01)
    assert session.response is answering and not answering.done()
    assert session.events.empty()
    await session.__aexit__()


def test_first_phrase_can_end_at_comma_so_voice_starts_sooner():
    # Первая фраза ответа уходит в озвучку по запятой: оператор слышит голос, пока модель пишет дальше.
    assert cascade.take_phrase("[паника] Алло, помогите пожалуйста, у нас", clause_from=20) == (
        "[паника] Алло, помогите пожалуйста,", "у нас")
    assert cascade.take_phrase("Алло, помогите", clause_from=20) == ("", "Алло, помогите")  # коротко — ждём
    # Адрес, номер и телефон по запятой не режем: интонация и цифры остаются целыми.
    assert cascade.take_phrase("Москва, улица Грина, дом 11, кв", clause_from=20)[0] == ""
    assert cascade.take_phrase("Записывайте телефон 8 916 123, 45", clause_from=20)[0] == ""
    assert cascade.take_phrase("Помогите пожалуйста, д. 11", clause_from=20)[0] == ""
    # Без clause_from — прежнее поведение: только целые предложения.
    assert cascade.take_phrase("[паника] Алло, помогите пожалуйста, у нас") == (
        "", "[паника] Алло, помогите пожалуйста, у нас")
