"""SpeechKit STT/TTS v3: непрерывный gRPC, без аудиофайлов и ключей в браузере."""
from __future__ import annotations

import asyncio
import importlib.util
from uuid import uuid4

import httpx

from app.api.errors import ApiError
from app.config import get_settings
from app.services.realtime_cascade import CascadeSession
from ml.speech import vad

STT_ENDPOINT = "stt.api.cloud.yandex.net:443"
TTS_ENDPOINT = "tts.api.cloud.yandex.net:443"


def configured() -> bool:
    settings = get_settings()
    return bool(settings.speechkit_api_key and settings.speechkit_api_key.get_secret_value().strip()
                and settings.live_call_llm_url and settings.live_call_llm_api_key
                and settings.live_call_llm_api_key.get_secret_value().strip()
                and importlib.util.find_spec("yandexcloud") and importlib.util.find_spec("torch")
                and vad.model_path().exists())


def metadata() -> tuple[tuple[str, str], ...]:
    settings = get_settings()
    if not settings.speechkit_api_key or not settings.speechkit_api_key.get_secret_value().strip():
        raise ApiError(503, "internal", "Добавьте SPEECHKIT_API_KEY в backend/.env")
    result = [("authorization", "Api-key " + settings.speechkit_api_key.get_secret_value().strip())]
    if settings.speechkit_folder_id:
        result.append(("x-folder-id", settings.speechkit_folder_id.strip()))
    return tuple(result)


def rpc_error(exc: Exception) -> ApiError:
    """Не пересылаем details()/debug_error_string() внешнего сервиса."""
    code = exc.code().name if callable(getattr(exc, "code", None)) else ""
    if code in {"UNAUTHENTICATED", "PERMISSION_DENIED"}:
        message = "SpeechKit отклонил доступ: проверьте ключ, роли и оплату Yandex Cloud"
    elif code == "RESOURCE_EXHAUSTED":
        message = "Достигнут лимит SpeechKit: проверьте квоты и баланс Yandex Cloud"
    elif code == "INVALID_ARGUMENT":
        message = "SpeechKit отклонил настройки: проверьте совместимость модели, голоса и амплуа"
    else:
        message = "Нет связи со SpeechKit. Подключитесь повторно"
    return ApiError(503, "internal", message)


class SpeechKitSession(CascadeSession):
    def __init__(self):
        super().__init__()
        self.channels = []
        self.stt_stub = None
        self.tts_stub = None
        self.utterance_lock = asyncio.Lock()
        self.finals: dict[int, str] = {}
        self.last_eou_ms = -1

    async def __aenter__(self):
        import grpc
        from yandex.cloud.ai.stt.v3.stt_service_pb2_grpc import RecognizerStub
        from yandex.cloud.ai.tts.v3.tts_service_pb2_grpc import SynthesizerStub

        metadata()  # отсутствие ключа — до подключения к облаку
        self.detector = await asyncio.to_thread(vad.SpeechDetector)
        try:
            self.channels = [grpc.aio.secure_channel(endpoint, grpc.ssl_channel_credentials())
                             for endpoint in (STT_ENDPOINT, TTS_ENDPOINT)]
            await asyncio.wait_for(asyncio.gather(*(channel.channel_ready() for channel in self.channels)), 10)
            self.stt_stub, self.tts_stub = RecognizerStub(self.channels[0]), SynthesizerStub(self.channels[1])
            self.client = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10), follow_redirects=False)
            await self.emit("session.created", session={"capabilities": {"turn_detection": ["server_vad"]}})
            return self
        except BaseException as exc:
            await self.__aexit__()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise rpc_error(exc) from exc

    async def __aexit__(self, *_args):
        await super().__aexit__()
        await asyncio.gather(*(channel.close() for channel in self.channels))
        self.channels = []

    async def start_utterance(self):
        async with self.utterance_lock:
            if self.speaking:
                return
            self.speaking = True
            self.item_id = "input-" + uuid4().hex
            await self.emit("input_audio_buffer.speech_started", item_id=self.item_id)
            await self.cancel_response()

    async def recognition_requests(self):
        from yandex.cloud.ai.stt.v3 import stt_pb2 as stt

        yield stt.StreamingRequest(session_options=stt.StreamingOptions(
            recognition_model=stt.RecognitionModelOptions(
                model="general", audio_processing_type=stt.RecognitionModelOptions.REAL_TIME,
                audio_format=stt.AudioFormatOptions(raw_audio=stt.RawAudio(
                    audio_encoding=stt.RawAudio.LINEAR16_PCM, sample_rate_hertz=16000, audio_channel_count=1)),
                language_restriction=stt.LanguageRestrictionOptions(
                    restriction_type=stt.LanguageRestrictionOptions.WHITELIST, language_code=["ru-RU"]),
                text_normalization=stt.TextNormalizationOptions(
                    text_normalization=stt.TextNormalizationOptions.TEXT_NORMALIZATION_ENABLED,
                    profanity_filter=False, literature_text=False)),
            eou_classifier=stt.EouClassifierOptions(default_classifier=stt.DefaultEouClassifier(
                type=stt.DefaultEouClassifier.DEFAULT, max_pause_between_words_hint_ms=500))))
        while True:
            pcm = await self.audio.get()
            while self.audio.qsize() and len(pcm) < 2560:
                pcm += self.audio.get_nowait()
            probability = await asyncio.to_thread(self.detector.push, pcm)
            if not self.speaking:
                self.onset_ms = self.onset_ms + len(pcm) / 32 if probability >= 0.65 else 0
                if self.onset_ms >= 96:
                    await self.start_utterance()
            yield stt.StreamingRequest(chunk=stt.AudioChunk(data=pcm))

    async def handle_recognition(self, event):
        kind = event.WhichOneof("Event")
        if kind in {"partial", "final"}:
            alternatives = getattr(event, kind).alternatives
            text = alternatives[0].text.strip() if alternatives else ""
            if not text:
                return
            await self.start_utterance()
            if kind == "final":
                self.finals[event.audio_cursors.final_index] = text
            else:
                await self.emit("conversation.item.input_audio_transcription.delta", item_id=self.item_id, delta=text)
        elif kind == "final_refinement":
            refinement = event.final_refinement
            alternatives = refinement.normalized_text.alternatives
            # Поздняя нормализация уже завершённой реплики не создаёт новый ответ.
            if refinement.final_index in self.finals and alternatives:
                self.finals[refinement.final_index] = alternatives[0].text.strip()
        elif kind == "eou_update":
            async with self.utterance_lock:
                if event.eou_update.time_ms <= self.last_eou_ms:
                    return
                self.last_eou_ms = event.eou_update.time_ms
                text = " ".join(self.finals[index] for index in sorted(self.finals)).strip()
                self.finals.clear()
                self.onset_ms = 0
                if self.speaking:
                    self.speaking = False
                    await self.emit("input_audio_buffer.speech_stopped", item_id=self.item_id)
                if text:
                    await self.emit("input_audio_buffer.committed", item_id=self.item_id)
                    await self.emit("conversation.item.input_audio_transcription.completed",
                                    item_id=self.item_id, transcript=text)
                    self.history.append({"role": "user", "content": text})
                    self.history = self.history[-16:]
                    await self.cancel_response()
                    self.response = asyncio.create_task(self.respond())

    async def listen(self):
        call = self.stt_stub.RecognizeStreaming(self.recognition_requests(), metadata=metadata(),
                                               timeout=min(get_settings().live_call_max_sec + 10, 295))
        try:
            async for event in call:
                await self.handle_recognition(event)
            if not self.closed:
                raise ApiError(503, "internal", "SpeechKit завершил распознавание. Подключитесь повторно")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.cancel_response()
            error = exc if isinstance(exc, ApiError) else rpc_error(exc)
            await self.emit("error", code="speechkit", message=error.message)
        finally:
            call.cancel()

    async def synthesis_requests(self, phrases: asyncio.Queue[str | None]):
        from yandex.cloud.ai.tts.v3 import tts_pb2 as tts

        settings = get_settings()
        yield tts.StreamSynthesisRequest(options=tts.SynthesisOptions(
            model=settings.speechkit_tts_model, voice=settings.speechkit_voice, role=settings.speechkit_role,
            output_audio_spec=tts.AudioFormatOptions(raw_audio=tts.RawAudio(
                audio_encoding=tts.RawAudio.LINEAR16_PCM, sample_rate_hertz=24000)),
            loudness_normalization_type=tts.LUFS))
        while True:
            phrase = await phrases.get()
            if phrase is None:
                # Заканчиваем буфер один раз; частые force ломают интонационный контекст.
                yield tts.StreamSynthesisRequest(force_synthesis=tts.ForceSynthesisEvent())
                return
            # Пробел сохраняет границы слов между последовательными сообщениями.
            yield tts.StreamSynthesisRequest(synthesis_input=tts.SynthesisInput(text=phrase.rstrip() + " "))

    async def synthesize(self, phrases: asyncio.Queue[str | None]):
        call = self.tts_stub.StreamSynthesis(self.synthesis_requests(phrases), metadata=metadata(), timeout=40)
        pending = b""
        received = False
        try:
            async for event in call:
                pending += event.audio_chunk.data
                aligned = len(pending) - len(pending) % 2
                if aligned:
                    received = True
                    chunk, pending = pending[:aligned], pending[aligned:]
                    yield chunk
            if pending or not received:
                raise ApiError(503, "internal", "SpeechKit не вернул корректный звук. Подключитесь повторно")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if isinstance(exc, ApiError):
                raise
            raise rpc_error(exc) from exc
        finally:
            call.cancel()
