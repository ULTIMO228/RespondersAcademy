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

    session = _session(lambda _: httpx.Response(200, content=_wav24(10)))
    monkeypatch.setattr(session, "reply_stream", tokens)
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


async def test_reasoning_effort_and_token_limit_come_from_settings(settings, monkeypatch):
    # У GLM-5.3 размышление обязательно (по умолчанию max → лишние секунды до первого слова);
    # уровень задаётся настройкой, а не угадывается по имени модели.
    monkeypatch.setattr(settings, "live_call_polza_chat_model", "qwen/open-chat")
    monkeypatch.setattr(settings, "live_call_polza_reasoning_effort", "low")
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"Да."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n')

    session = _session(handler)
    async with session.client:
        from app.services.realtime_cascade import stream_reply
        assert [d async for d in stream_reply([], session.client, session.llm_endpoint(), session.llm_options())] == ["Да."]
        monkeypatch.setattr(settings, "live_call_polza_reasoning_effort", None)
        _ = [d async for d in stream_reply([], session.client, session.llm_endpoint(), session.llm_options())]
    assert bodies[0]["reasoning_effort"] == "low" and bodies[0]["max_completion_tokens"] == 1500
    assert "reasoning_effort" not in bodies[1]  # не задано — не отправляем, даже для qwen


async def test_tts_json_response_with_base64_audio_is_decoded(settings):
    import base64

    def handler(_request):
        return httpx.Response(200, json={"audio": base64.b64encode(_wav24(100)).decode(), "contentType": "audio/wav",
                                         "usage": {"characters": 3}})

    session = _session(handler)
    assert len(await session.tts("Да.")) == 200
    await session.client.aclose()


async def test_phrases_are_synthesized_in_parallel_but_played_in_order(settings):
    # Озвучка через агрегатор — секунды на фразу: следующие фразы запрашиваются сразу,
    # иначе между предложениями заявителя дыры по несколько секунд.
    started: list[str] = []
    release = asyncio.Event()

    session = polza.PolzaSession()

    async def tts(text, mood=None):
        started.append(text)
        if text == "Первая.":
            await release.wait()  # первая фраза «тормозит» дольше второй
        return text.encode()

    session.tts = tts
    phrases: asyncio.Queue = asyncio.Queue()
    for item in ("Первая.", "Вторая.", None):
        await phrases.put(item)
    stream = session.synthesize(phrases)
    first = asyncio.ensure_future(stream.__anext__())
    for _ in range(50):
        if len(started) == 2:
            break
        await asyncio.sleep(0.01)
    assert started == ["Первая.", "Вторая."]  # вторая запрошена, пока первая ещё не готова
    release.set()
    assert await first == "Первая.".encode()
    assert await stream.__anext__() == "Вторая.".encode()
    await stream.aclose()


def _sse(*chunks: str, finish: str | None = "stop") -> str:
    lines = [f'data: {{"choices":[{{"delta":{{"content":{json.dumps(c, ensure_ascii=False)}}}}}]}}\n\n' for c in chunks]
    if finish:
        lines.append(f'data: {{"choices":[{{"delta":{{}},"finish_reason":"{finish}"}}]}}\n\n')
    return "".join(lines) + "data: [DONE]\n\n"


async def test_empty_failed_stream_is_retried_once(settings):
    calls = []

    def handler(_request):
        calls.append(1)
        return httpx.Response(200, text=_sse(finish=None) if len(calls) == 1 else _sse("Да, горит."))

    session = _session(handler)
    assert [d async for d in session.reply_stream([])] == ["Да, горит."]
    assert len(calls) == 2
    await session.client.aclose()


async def test_partial_answer_is_kept_and_call_survives(settings, caplog):
    # Обрыв после первых слов: сказанное уже звучит у оператора — не рвём звонок ошибкой.
    session = _session(lambda _: httpx.Response(200, text=_sse("Улица Грина, ", "дом", finish="length")))
    assert "".join([d async for d in session.reply_stream([])]) == "Улица Грина, дом"
    assert "length" in caplog.text  # причина обрыва видна в логе сервера
    await session.client.aclose()


async def test_repeated_failure_is_reported(settings):
    session = _session(lambda _: httpx.Response(200, text=_sse(finish=None)))
    with pytest.raises(ApiError, match="не закончила"):
        _ = [d async for d in session.reply_stream([])]
    await session.client.aclose()


def test_reasoning_cap_replaces_effort(settings, monkeypatch):
    # Замер 19.10 на GLM-5.3-Flash: effort=low после перебивания думал до 1500 токенов (ответа нет),
    # reasoning.max_tokens=64 — 14–78 токенов; вместе с effort провайдер возвращал пустой ответ.
    monkeypatch.setattr(settings, "live_call_polza_reasoning_effort", "low")
    monkeypatch.setattr(settings, "live_call_polza_reasoning_max_tokens", 64)
    options = polza.PolzaSession().llm_options()
    assert options["reasoning"] == {"max_tokens": 64} and "reasoning_effort" not in options


async def test_interrupted_reply_stays_in_memory_so_caller_does_not_greet_again(settings, monkeypatch):
    # Звонок 19.10: приветствие перебили → модель «забыла» его и на вопрос об адресе снова сказала «Здравствуйте!».
    gate = asyncio.Event()

    async def tokens(*_args):
        yield "[паника] Алло! Горит балкон."
        await gate.wait()  # перебивают посреди ответа
        yield " Ещё дым."

    session = _session(lambda _: httpx.Response(200, content=_wav24(10)))
    monkeypatch.setattr(session, "reply_stream", tokens)
    task = asyncio.create_task(session.respond(initial=True))
    for _ in range(100):
        if any(event["type"] == "response.text.delta" for event in list(session.events._queue)):
            break
        await asyncio.sleep(0.01)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert session.history[-1]["role"] == "assistant"
    assert session.history[-1]["content"].startswith("[паника] Алло! Горит балкон.")
    assert "перебил" in session.history[-1]["content"]
    await session.client.aclose()


async def test_local_silero_voice_gets_mood_as_prosody_and_no_network(settings, monkeypatch):
    # Озвучка локально (Silero на CPU): без сетевого запроса, настроение — темпом и высотой (SSML).
    from ml.speech import tts as silero

    monkeypatch.setattr(settings, "live_call_tts_engine", "silero")
    monkeypatch.setattr(settings, "live_call_silero_speaker", "xenia")
    monkeypatch.setattr(settings, "live_call_silero_model", "v5_ru.pt")
    seen = {}

    class Model:
        def apply_tts(self, ssml_text, speaker, sample_rate):
            seen.update(ssml=ssml_text, speaker=speaker, rate=sample_rate)
            return np.zeros(240, dtype=np.float32)

    monkeypatch.setattr(silero, "load_live_model", lambda _name: Model())
    session = _session(lambda _: pytest.fail("сетевой запрос к TTS при локальной озвучке"))
    pcm = await session.tts("Горит дом 11!", "паника")
    assert len(pcm) == 480
    assert seen["speaker"] == "xenia" and seen["rate"] == 24000
    assert seen["ssml"].startswith("<speak><prosody") and 'rate="fast"' in seen["ssml"] and 'pitch="high"' in seen["ssml"]
    assert "одиннадцать" in seen["ssml"]  # Silero не читает цифры — переводим в слова
    await session.client.aclose()


def test_silero_engine_does_not_need_polza_tts_model(settings, monkeypatch):
    monkeypatch.setattr(polza.vad, "model_path", lambda: type("P", (), {"exists": lambda self: True})())
    monkeypatch.setattr(polza.importlib.util, "find_spec", lambda _name: object())
    monkeypatch.setattr(settings, "live_call_tts_engine", "silero")
    monkeypatch.setattr(settings, "live_call_polza_tts_model", None)
    monkeypatch.setattr(settings, "live_call_silero_model", "v5_ru.pt")
    monkeypatch.setattr(settings, "live_call_silero_speaker", "xenia")
    from ml.speech import tts as silero

    monkeypatch.setattr(silero, "live_model_path", lambda name: type("P", (), {"exists": lambda self: True})())
    assert polza.configured()
    monkeypatch.setattr(silero, "live_model_path", lambda name: type("P", (), {"exists": lambda self: False})())
    assert not polza.configured()


async def test_silero_voice_is_warmed_once_before_the_call_is_ready(settings, monkeypatch):
    # Холодный Silero: загрузка ~12 с + первая озвучка ~5 с — приветствие пропадало. Прогрев до «ready», один раз.
    from ml.speech import tts as silero

    monkeypatch.setattr(settings, "live_call_tts_engine", "silero")
    monkeypatch.setattr(settings, "live_call_silero_model", "v5_6_ru.pt")
    monkeypatch.setattr(settings, "live_call_silero_speaker", "xenia")
    calls = []
    monkeypatch.setattr(silero, "synthesize_live", lambda *args, **_kw: calls.append(args) or b"\0\0")
    monkeypatch.setattr(polza, "_voice_warm", False)
    await asyncio.gather(polza.warm_voice(), polza.warm_voice())
    await polza.warm_voice()
    assert len(calls) == 1 and calls[0][1:3] == ("v5_6_ru.pt", "xenia")


def test_reasoning_off_and_provider_routing_come_from_settings(settings, monkeypatch):
    # Замер 20.10, qwen/qwen3.8-27b: reasoning_effort=none игнорируется (300 токенов «мыслей», пустой ответ),
    # reasoning.enabled=false — ответ без размышления; провайдер (cerebras/fp16) выбирается полем provider.
    monkeypatch.setattr(settings, "live_call_polza_reasoning_off", True)
    monkeypatch.setattr(settings, "live_call_polza_reasoning_max_tokens", 64)
    monkeypatch.setattr(settings, "live_call_polza_provider", "cerebras/fp16")
    options = polza.PolzaSession().llm_options()
    assert options["reasoning"] == {"enabled": False} and "reasoning_effort" not in options
    assert options["provider"] == {"order": ["cerebras/fp16"], "allow_fallbacks": True}
    monkeypatch.setattr(settings, "live_call_polza_reasoning_off", False)
    monkeypatch.setattr(settings, "live_call_polza_provider", None)
    options = polza.PolzaSession().llm_options()
    assert options["reasoning"] == {"max_tokens": 64} and "provider" not in options


async def test_empty_answer_is_retried_once(settings):
    # qwen3.8-27b, 20.10: на «Ваше имя и телефон?» модель закончила ответ без единого слова;
    # в звонке это ошибка «пустой ответ» и обрыв. Повторяем запрос один раз.
    calls = []

    def handler(_request):
        calls.append(1)
        return httpx.Response(200, text=_sse() if len(calls) == 1 else _sse("Сидорова Анна Викторовна."))

    session = _session(handler)
    assert [d async for d in session.reply_stream([])] == ["Сидорова Анна Викторовна."]
    assert len(calls) == 2
    await session.client.aclose()


def _speech_session(settings, monkeypatch, handler):
    monkeypatch.setattr(settings, "live_call_end_silence_ms", 600)
    monkeypatch.setattr(settings, "live_call_early_commit_ms", 200)

    class Detector:
        def push(self, pcm):
            return 0.99 if np.abs(np.frombuffer(pcm, dtype="<i2")).max() > 100 else 0.01

    session = _session(handler)
    session.detector = Detector()
    return session


SPEECH = (np.ones(1600, dtype=np.int16) * 3000).astype("<i2").tobytes()  # 100 мс речи
SILENCE = b"\0" * 3200  # 100 мс тишины


async def _drain(session):
    for _ in range(200):
        if session.audio.empty():
            break
        await asyncio.sleep(0.005)
    await asyncio.sleep(0.05)


async def test_stt_starts_before_end_of_turn_but_reply_waits_for_it(settings, monkeypatch):
    # Распознавание (~2,4 с у Polza) стартует на короткой паузе, а не после всей паузы конца реплики:
    # время тишины перекрывается сетевым запросом. Отвечать заявитель начинает только после конца реплики.
    calls = []
    session = _speech_session(settings, monkeypatch, lambda r: calls.append(r) or httpx.Response(200, json={"text": "Где горит?"}))
    responded = asyncio.Event()

    async def respond(initial=False):
        responded.set()
        await asyncio.Future()

    monkeypatch.setattr(session, "respond", respond)
    session.listener = asyncio.create_task(session.listen())
    for chunk in [SPEECH] * 5 + [SILENCE] * 3:  # 300 мс тишины: больше 200, меньше 600
        await session.audio.put(chunk)
    await _drain(session)
    assert len(calls) == 1  # запрос уже ушёл
    assert not responded.is_set() and session.history == []  # но ход оператора не закончен
    for _ in range(4):
        await session.audio.put(SILENCE)
    await asyncio.wait_for(responded.wait(), 2)
    assert len(calls) == 1  # повторно то же аудио не распознаём
    assert session.history == [{"role": "user", "content": "Где горит?"}]
    await session.__aexit__()


async def test_early_stt_is_dropped_when_operator_keeps_talking(settings, monkeypatch):
    # Оператор сделал паузу посреди фразы: ранний результат выбрасывается, в модель уходит вся фраза.
    texts = iter(["Назовите", "Назовите адрес"])
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"text": next(texts)})

    session = _speech_session(settings, monkeypatch, handler)
    responded = asyncio.Event()

    async def respond(initial=False):
        responded.set()
        await asyncio.Future()

    monkeypatch.setattr(session, "respond", respond)
    session.listener = asyncio.create_task(session.listen())
    for chunk in [SPEECH] * 5 + [SILENCE] * 3:
        await session.audio.put(chunk)
    await _drain(session)
    for chunk in [SPEECH] * 5 + [SILENCE] * 7:
        await session.audio.put(chunk)
    await asyncio.wait_for(responded.wait(), 2)
    assert len(calls) == 2
    assert session.history == [{"role": "user", "content": "Назовите адрес"}]
    events = [session.events.get_nowait() for _ in range(session.events.qsize())]
    shown = [e["transcript"] for e in events if e["type"] == "conversation.item.input_audio_transcription.completed"]
    assert shown == ["Назовите адрес"]  # оборванный вариант оператору не показываем
    await session.__aexit__()


def test_early_commit_setting_is_bounded():
    from app.config import Settings

    assert Settings(LIVE_CALL_EARLY_COMMIT_MS=0).live_call_early_commit_ms == 0  # 0 — выключено
    with pytest.raises(ValueError):
        Settings(LIVE_CALL_EARLY_COMMIT_MS=-1)


async def test_turn_latency_is_logged_by_stage(settings, monkeypatch, caplog):
    # Замер задержки в живом звонке: распознавание, первое слово модели, первый звук — в лог сервера, без текста реплик.
    import logging

    caplog.set_level(logging.INFO, logger="app.services.realtime_polza")

    async def tokens(*_args):
        yield "Горит балкон."

    session = _speech_session(settings, monkeypatch, lambda _r: httpx.Response(200, json={"text": "Что горит?"}))
    monkeypatch.setattr(session, "reply_stream", tokens)

    async def tts(text, mood=None):
        return b"\0\0" * 240

    session.tts = tts
    session.listener = asyncio.create_task(session.listen())
    for chunk in [SPEECH] * 5 + [SILENCE] * 8:
        await session.audio.put(chunk)
    for _ in range(200):
        if "первый звук" in caplog.text:
            break
        await asyncio.sleep(0.01)
    assert "распознавание" in caplog.text and "первое слово" in caplog.text and "первый звук" in caplog.text
    assert "Что горит" not in caplog.text and "балкон" not in caplog.text
    await session.__aexit__()
