"""Настоящие protobuf и локальные gRPC-потоки; внешние ключи/сеть не используются."""
import asyncio
import base64
import json
from contextlib import aclosing
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from app.services import realtime_cascade as cascade
from app.services import realtime_speechkit as speechkit

grpc = pytest.importorskip("grpc")
stt = pytest.importorskip("yandex.cloud.ai.stt.v3.stt_pb2")
stt_service = pytest.importorskip("yandex.cloud.ai.stt.v3.stt_service_pb2_grpc")
tts = pytest.importorskip("yandex.cloud.ai.tts.v3.tts_pb2")
tts_service = pytest.importorskip("yandex.cloud.ai.tts.v3.tts_service_pb2_grpc")


@pytest.fixture
def settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "speechkit_api_key", SecretStr("test-yandex-secret"))
    monkeypatch.setattr(settings, "speechkit_folder_id", "test-folder")
    monkeypatch.setattr(settings, "speechkit_tts_model", "livetts")
    monkeypatch.setattr(settings, "speechkit_voice", "denis")
    monkeypatch.setattr(settings, "speechkit_role", "casual")
    return settings


@pytest_asyncio.fixture
async def server(settings):
    state = SimpleNamespace(stt_requests=[], tts_requests=[], metadata=[], tts_closed=asyncio.Event(),
                            stt_closed=asyncio.Event(), error=None)

    class Recognizer(stt_service.RecognizerServicer):
        async def RecognizeStreaming(self, requests, context):
            state.metadata.append(dict(context.invocation_metadata()))
            try:
                async for request in requests:
                    state.stt_requests.append(request)
                    if state.error:
                        await context.abort(state.error, "RAW PRIVATE PROVIDER ERROR test-yandex-secret")
                    if request.WhichOneof("Event") == "chunk":
                        yield stt.StreamingResponse(partial=stt.AlternativeUpdate(
                            alternatives=[stt.Alternative(text="назовите адрес")]))
                        yield stt.StreamingResponse(final=stt.AlternativeUpdate(
                            alternatives=[stt.Alternative(text="назовите")]), audio_cursors=stt.AudioCursors(final_index=1))
                        yield stt.StreamingResponse(final=stt.AlternativeUpdate(
                            alternatives=[stt.Alternative(text="адрес")]), audio_cursors=stt.AudioCursors(final_index=2))
                        yield stt.StreamingResponse(eou_update=stt.EouUpdate(time_ms=1000))
                        # Нормализация после EOU и дубликат EOU не порождают второй ответ.
                        yield stt.StreamingResponse(final_refinement=stt.FinalRefinement(
                            final_index=2, normalized_text=stt.AlternativeUpdate(alternatives=[stt.Alternative(text="Адрес.")])))
                        yield stt.StreamingResponse(eou_update=stt.EouUpdate(time_ms=1000))
            finally:
                state.stt_closed.set()

    class Synthesizer(tts_service.SynthesizerServicer):
        async def StreamSynthesis(self, requests, context):
            state.metadata.append(dict(context.invocation_metadata()))
            try:
                async for request in requests:
                    state.tts_requests.append(request)
                    if state.error:
                        # Сначала принимаем конечный тестовый запрос целиком: иначе
                        # Windows gRPC Core может скрыть trailers за гонкой SendMessage.
                        async for _ in requests:
                            pass
                        await context.abort(state.error, "RAW PRIVATE PROVIDER ERROR test-yandex-secret")
                    if request.WhichOneof("Event") == "synthesis_input":
                        # Даже разрыв по середине int16-сэмпла не портит PCM браузера.
                        yield tts.StreamSynthesisResponse(audio_chunk=tts.AudioChunk(data=b"\x01"))
                        yield tts.StreamSynthesisResponse(audio_chunk=tts.AudioChunk(data=b"\x00" * 9599))
            finally:
                state.tts_closed.set()

    server = grpc.aio.server()
    stt_service.add_RecognizerServicer_to_server(Recognizer(), server)
    tts_service.add_SynthesizerServicer_to_server(Synthesizer(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    channel = grpc.aio.insecure_channel(f"127.0.0.1:{port}")
    session = speechkit.SpeechKitSession()
    session.channels = [channel]
    session.stt_stub, session.tts_stub = stt_service.RecognizerStub(channel), tts_service.SynthesizerStub(channel)
    session.detector = SimpleNamespace(push=lambda _: 0.99)
    session.client = httpx.AsyncClient()
    try:
        yield session, state
    finally:
        await session.__aexit__()
        await server.stop(0)


async def wait_for_event(session, kind):
    async with asyncio.timeout(3):
        while True:
            event = json.loads(await session.recv())
            if event["type"] == kind:
                return event


async def test_continuous_grpc_stt_and_one_commit_per_eou(server, monkeypatch):
    session, state = server
    answered = []

    async def respond(initial=False):
        answered.append(initial)
        await asyncio.Future()

    monkeypatch.setattr(session, "respond", respond)
    await session.send(json.dumps({"type": "session.update", "session": {"instructions": "Синтетические факты"}}))
    await asyncio.sleep(0)
    assert answered == [True]  # заявитель первым, до аудио оператора
    pcm = b"\x01\x00" * 1600
    await session.send(json.dumps({"type": "input_audio_buffer.append", "audio": base64.b64encode(pcm).decode()}))
    completed = await wait_for_event(session, "conversation.item.input_audio_transcription.completed")
    assert completed["transcript"] == "назовите адрес"
    async with asyncio.timeout(3):
        while len(answered) < 2:
            await asyncio.sleep(0.01)
    await asyncio.sleep(0.02)
    assert answered == [True, False]
    assert session.history == [{"role": "user", "content": "назовите адрес"}]
    options, audio = state.stt_requests[:2]
    raw = options.session_options.recognition_model.audio_format.raw_audio
    assert raw.sample_rate_hertz == 16000 and raw.audio_channel_count == 1
    assert audio.chunk.data == pcm
    assert state.metadata[0]["authorization"] == "Api-key test-yandex-secret"
    assert state.metadata[0]["x-folder-id"] == "test-folder"
    assert not session.listener.done()  # одна сессия остаётся принимать следующий вопрос
    await session.__aexit__()
    await asyncio.wait_for(state.stt_closed.wait(), 3)


async def test_tts_emits_pcm_before_text_stream_finishes_and_cancels_rpc(server):
    session, state = server
    phrases = asyncio.Queue()
    await phrases.put("Помогите, у нас пожар.")
    async with aclosing(session.synthesize(phrases)) as audio:
        first = await asyncio.wait_for(anext(audio), 3)
        assert first == b"\x01" + b"\x00" * 9599
        assert state.tts_requests[0].options.model == "livetts"
        options = state.tts_requests[0].options
        assert options.voice == "denis" and options.role == "casual"
        assert options.output_audio_spec.raw_audio.sample_rate_hertz == 24000
        assert state.tts_requests[1].synthesis_input.text.endswith(" ")
        assert phrases.empty()  # None не передан, текстовый поток ещё открыт
        assert not any(request.WhichOneof("Event") == "force_synthesis" for request in state.tts_requests)
    await asyncio.wait_for(state.tts_closed.wait(), 3)


async def test_speechkit_flushes_only_after_complete_reply(server):
    session, state = server
    phrases = asyncio.Queue()
    await phrases.put("Помогите, у нас пожар!")
    await phrases.put("Я стою на улице.")
    await phrases.put(None)
    chunks = [chunk async for chunk in session.synthesize(phrases)]
    assert chunks and all(len(chunk) % 2 == 0 for chunk in chunks)
    kinds = [request.WhichOneof("Event") for request in state.tts_requests]
    assert kinds == ["options", "synthesis_input", "synthesis_input", "force_synthesis"]


async def test_barge_in_cancels_active_speechkit_rpc_and_no_late_audio(server, monkeypatch):
    session, state = server

    async def tokens(*_args):
        yield "Здравствуйте, у нас пожар. "
        await asyncio.Future()

    monkeypatch.setattr(cascade, "stream_reply", tokens)
    session.response = asyncio.create_task(session.respond(initial=True))
    audio = await wait_for_event(session, "response.audio.delta")
    await session.start_utterance()
    await asyncio.wait_for(state.tts_closed.wait(), 3)
    events = [session.events.get_nowait() for _ in range(session.events.qsize())]
    assert any(event["type"] == "input_audio_buffer.speech_started" for event in events)
    assert any(event["type"] == "response.done" and event["response"]["status"] == "cancelled" for event in events)
    assert not any(event["type"] == "response.audio.delta" and event["response_id"] == audio["response_id"] for event in events)
    assert session.history == []


@pytest.mark.parametrize("code,expected", [
    (grpc.StatusCode.UNAUTHENTICATED, "доступ"),
    (grpc.StatusCode.RESOURCE_EXHAUSTED, "лимит"),
    (grpc.StatusCode.INVALID_ARGUMENT, "настройки"),
    (grpc.StatusCode.UNAVAILABLE, "связи"),
])
async def test_grpc_tts_errors_are_readable_and_do_not_leak_provider_details(server, code, expected):
    session, state = server
    state.error = code
    phrases = asyncio.Queue()
    await phrases.put("Тест")
    await phrases.put(None)
    with pytest.raises(ApiError) as error:
        _ = [chunk async for chunk in session.synthesize(phrases)]
    assert isinstance(error.value.__cause__, grpc.aio.AioRpcError)
    assert error.value.__cause__.code() == code
    assert expected in error.value.message
    assert "PRIVATE" not in error.value.message and "test-yandex-secret" not in error.value.message


async def test_stt_auth_failure_stops_response_and_cleans_stream(server):
    session, state = server
    state.error = grpc.StatusCode.PERMISSION_DENIED
    session.response = asyncio.create_task(asyncio.sleep(30))
    session.listener = asyncio.create_task(session.listen())
    event = await wait_for_event(session, "error")
    assert "доступ" in event["message"] and "test-yandex-secret" not in event["message"]
    assert session.response is None
    await asyncio.wait_for(state.stt_closed.wait(), 3)


def test_missing_key_disables_only_speechkit(settings, monkeypatch):
    monkeypatch.setattr(settings, "speechkit_api_key", None)
    assert speechkit.configured() is False
    with pytest.raises(ApiError, match="SPEECHKIT_API_KEY"):
        speechkit.metadata()


def test_secret_is_not_in_settings_representation(settings):
    assert "test-yandex-secret" not in repr(settings)
