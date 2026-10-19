"""Живой заявитель через Polza.ai: локальный VAD → STT → потоковый LLM → TTS с эмоцией.

Все три модели вызываются через OpenAI-совместимый API Polza (/audio/transcriptions,
/chat/completions, /audio/speech). Идентификаторы моделей и голос задаются только
окружением: смена на локальный совместимый сервер (vLLM и т. п.) — это смена
POLZA_BASE_URL и имён моделей, без изменений кода. На сервере остаётся только
Silero VAD (границы реплик и перебивание).
"""
from __future__ import annotations

import asyncio
import base64
import importlib.util
import logging
import random
from collections import deque
from uuid import uuid4

import httpx
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from app.services import caller_persona as persona
from app.services.realtime_cascade import CascadeSession, stream_reply
from ml.speech import vad

PROVIDER = "Polza.ai"
logger = logging.getLogger(__name__)
MIN_VOICED_MS = 200  # щелчок/стук короче не отправляем в STT
MAX_UTTERANCE_MS = 15000
PREROLL_MS = 300
# Короткие отклики сразу после реплики оператора, пока готовится ответ (озвучка через API — секунды).
FILLERS = ("Да-да…", "Ой…", "Так…")


def configured() -> bool:
    settings = get_settings()
    key = settings.polza_api_key
    return bool(key and key.get_secret_value().strip()
                and settings.live_call_polza_chat_model and settings.live_call_polza_stt_model
                and settings.live_call_polza_tts_model
                and importlib.util.find_spec("torch") and vad.model_path().exists())


def provider_error(status: int, what: str) -> ApiError:
    """Читаемая ошибка без тела ответа провайдера (там могут быть детали аккаунта)."""
    if status in (401, 403):
        message = f"{PROVIDER} отклонил доступ к {what}: проверьте POLZA_API_KEY"
    elif status == 402:
        message = f"У {PROVIDER} недостаточно средств для {what}"
    elif status == 429:
        message = f"Достигнут лимит {PROVIDER} для {what}. Повторите позже"
    elif status in (400, 404, 422):
        message = f"{PROVIDER} отклонил запрос к {what}: проверьте имя модели и голос в настройках"
    else:
        message = f"{PROVIDER} не ответил на запрос к {what}. Повторите подключение"
    return ApiError(503, "internal", message)


class PolzaSession(CascadeSession):
    def __init__(self):
        super().__init__()
        self.mood = persona.DEFAULT_MOOD
        self.stt_lock = asyncio.Lock()
        self.transcriptions: set[asyncio.Task] = set()
        self.fillers: list[bytes] = []
        self.filler_task: asyncio.Task | None = None

    async def __aenter__(self):
        settings = get_settings()
        if not (settings.polza_api_key and settings.polza_api_key.get_secret_value().strip()):
            raise ApiError(503, "internal", "Добавьте POLZA_API_KEY в backend/.env")
        self.detector = await asyncio.to_thread(vad.SpeechDetector)
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(settings.polza_timeout_sec, connect=10),
                                        follow_redirects=False)
        if settings.live_call_fillers:
            self.filler_task = asyncio.create_task(self.prepare_fillers())
        await self.emit("session.created", session={"capabilities": {"turn_detection": ["server_vad"]}})
        return self

    async def __aexit__(self, *_args):
        tasks = [*self.transcriptions, *([self.filler_task] if self.filler_task else [])]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await super().__aexit__()

    async def prepare_fillers(self):
        """Один раз за звонок, в фоне; сбой не мешает разговору — просто без откликов."""
        results = await asyncio.gather(*(self.tts(text, "тревожно") for text in FILLERS), return_exceptions=True)
        self.fillers = [pcm for pcm in results if isinstance(pcm, bytes) and pcm]

    # --- общие параметры запросов ---
    def _base(self) -> str:
        return get_settings().polza_base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        key = get_settings().polza_api_key
        return {"Authorization": "Bearer " + (key.get_secret_value().strip() if key else "")}

    def llm_endpoint(self) -> tuple[str, SecretStr | None, str, str]:
        settings = get_settings()
        return settings.polza_base_url, settings.polza_api_key, settings.live_call_polza_chat_model or "", PROVIDER

    def llm_options(self) -> dict:
        # Размышление (у GLM-5.3 обязательное) тратит тот же лимит: при 400 токенах после перебитой
        # реплики модель «думала» до лимита и не успевала ответить (finish=length). Длину самой
        # реплики ограничивает respond() — 600 символов.
        options: dict = {"max_completion_tokens": 1500}
        settings = get_settings()
        if settings.live_call_polza_reasoning_max_tokens:
            options["reasoning"] = {"max_tokens": settings.live_call_polza_reasoning_max_tokens}
        elif settings.live_call_polza_reasoning_effort:
            options["reasoning_effort"] = settings.live_call_polza_reasoning_effort
        return options

    async def reply_stream(self, messages: list[dict[str, str]]):
        """Сбой до первого слова — один повтор; после — оставляем сказанное, звонок не рвём."""
        for attempt in (1, 2):
            produced = False
            try:
                async for delta in stream_reply(messages, self.client, self.llm_endpoint(), self.llm_options()):
                    produced = True
                    yield delta
                return
            except ApiError:
                if produced:
                    logger.warning("Ответ заявителя оборван провайдером; сказанное сохранено")
                    return
                if attempt == 2:
                    raise

    def on_interrupted(self, text: str) -> None:
        # Оператор уже слышал начало: без этого модель «забывает» сказанное и здоровается заново.
        if text.strip():
            self.history.append({"role": "assistant", "content": text.rstrip() + " … (оператор перебил)"})
            self.history = self.history[-16:]

    def text_filter(self):
        return persona.TagFilter()

    def reply_rules(self) -> str:
        # Метки настроения и звуков нужны озвучке; оператор их не видит (TagFilter).
        return ("Верни только произносимую реплику с метками из списка выше, без markdown и кавычек. "
                "Не читай названия полей карточки. Обращайся к оператору естественно.")

    # --- распознавание: локальный VAD режет реплики, текст — Polza STT ---
    async def transcribe(self, pcm: bytes) -> str:
        settings = get_settings()
        try:
            response = await self.client.post(
                self._base() + "/audio/transcriptions", headers=self._headers(),
                files={"file": ("speech.wav", persona.pcm16_to_wav(pcm), "audio/wav")},
                data={"model": settings.live_call_polza_stt_model or "", "language": "ru", "response_format": "json"})
        except httpx.HTTPError as exc:
            raise ApiError(503, "internal", f"Нет связи с {PROVIDER} (распознавание речи)") from exc
        if not response.is_success:
            raise provider_error(response.status_code, "распознаванию речи")
        try:
            return str(response.json().get("text", "")).strip()
        except ValueError as exc:
            raise ApiError(503, "internal", f"{PROVIDER} вернул некорректный ответ распознавания") from exc

    async def commit(self, item_id: str, pcm: bytes):
        try:
            # Реплики распознаются по порядку: поздний ответ STT не обгоняет более раннюю фразу.
            async with self.stt_lock:
                text = await self.transcribe(pcm)
            if not text:
                return
            await self.emit("input_audio_buffer.committed", item_id=item_id)
            await self.emit("conversation.item.input_audio_transcription.completed", item_id=item_id, transcript=text)
            self.history.append({"role": "user", "content": text})
            self.history = self.history[-16:]
            await self.cancel_response()
            self.response = asyncio.create_task(self.respond())
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            message = exc.message if isinstance(exc, ApiError) else "Распознавание речи прервалось. Подключитесь повторно"
            await self.emit("error", code="polza", message=message)

    async def listen(self):
        settings = get_settings()
        preroll: deque[bytes] = deque()
        utterance = bytearray()
        voiced_ms = 0.0
        try:
            while True:
                pcm = await self.audio.get()
                while self.audio.qsize() and len(pcm) < 2560:
                    pcm += self.audio.get_nowait()
                duration = len(pcm) / 32  # мс при PCM16 16 кГц
                voiced = await asyncio.to_thread(self.detector.push, pcm) >= (0.35 if self.speaking else 0.65)
                if not self.speaking:
                    preroll.append(pcm)
                    while sum(map(len, preroll)) > PREROLL_MS * 32:
                        preroll.popleft()
                    self.onset_ms = self.onset_ms + duration if voiced else 0
                    if self.onset_ms < 96:
                        continue
                    self.speaking, self.silent_ms = True, 0
                    self.item_id = "input-" + uuid4().hex
                    utterance = bytearray(b"".join(preroll))  # начало первого слова не обрезаем
                    preroll.clear()
                    voiced_ms = self.onset_ms
                    await self.emit("input_audio_buffer.speech_started", item_id=self.item_id)
                    await self.cancel_response()
                    continue
                utterance += pcm
                voiced_ms += duration if voiced else 0
                self.silent_ms = 0 if voiced else self.silent_ms + duration
                if self.silent_ms < settings.live_call_end_silence_ms and len(utterance) < MAX_UTTERANCE_MS * 32:
                    continue
                self.speaking, self.onset_ms, self.silent_ms = False, 0, 0
                await self.emit("input_audio_buffer.speech_stopped", item_id=self.item_id)
                if voiced_ms >= MIN_VOICED_MS:
                    task = asyncio.create_task(self.commit(self.item_id, bytes(utterance)))
                    self.transcriptions.add(task)
                    task.add_done_callback(self.transcriptions.discard)
                utterance = bytearray()
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.emit("error", code="polza", message="Распознавание речи прервалось. Подключитесь повторно")

    # --- озвучка: текст без меток + инструкция эмоции, неречевые звуки — вставками ---
    async def tts(self, text: str, mood: str | None = None) -> bytes:
        settings = get_settings()
        body: dict[str, str] = {"model": settings.live_call_polza_tts_model or "", "input": text,
                                "response_format": settings.live_call_polza_tts_format}
        if settings.live_call_polza_tts_voice:
            body["voice"] = settings.live_call_polza_tts_voice
        if settings.live_call_polza_tts_instructions:
            body["instructions"] = persona.MOODS[mood or self.mood]
        try:
            response = await self.client.post(self._base() + "/audio/speech", headers=self._headers(), json=body)
        except httpx.HTTPError as exc:
            raise ApiError(503, "internal", f"Нет связи с {PROVIDER} (синтез речи)") from exc
        if not response.is_success:
            raise provider_error(response.status_code, "синтезу речи")
        audio = response.content
        if response.headers.get("content-type", "").startswith("application/json"):
            # Polza отдаёт {"audio": base64, "contentType": ..., "usage": ...}, а не байты звука.
            try:
                audio = base64.b64decode(response.json()["audio"])
            except (ValueError, KeyError, TypeError) as exc:
                raise ApiError(503, "internal", f"{PROVIDER} вернул некорректный ответ синтеза речи") from exc
        if settings.live_call_polza_tts_format == "pcm":
            return audio  # OpenAI-совместимый pcm: 24 кГц, 16 бит, моно
        try:
            return persona.wav_to_pcm24(audio)
        except Exception as exc:
            raise ApiError(503, "internal", f"{PROVIDER} вернул звук в неожиданном формате; "
                           "проверьте LIVE_CALL_POLZA_TTS_FORMAT") from exc

    async def render(self, part: persona.Segment, mood: str) -> bytes:
        if part.kind == "speech":
            return await self.tts(part.text, mood)
        if part.kind == "sound" and part.path is not None:
            return await asyncio.to_thread(persona.wav_to_pcm24, part.path.read_bytes())
        return persona.silence(part.ms)

    async def synthesize(self, phrases: asyncio.Queue[str | None]):
        """Каждая фраза уходит в TTS сразу, как готова; звучат строго по порядку."""
        sounds_dir = get_settings().live_call_sounds_dir
        order: asyncio.Queue[asyncio.Task | None] = asyncio.Queue()
        started: list[asyncio.Task] = []

        async def feed():
            while True:
                phrase = await phrases.get()
                if phrase is None:
                    await order.put(None)
                    return
                parts, self.mood = persona.segments(phrase, sounds_dir, self.mood)
                for part in parts:
                    task = asyncio.create_task(self.render(part, self.mood))
                    started.append(task)
                    await order.put(task)

        feeder = asyncio.create_task(feed())
        try:
            if self.fillers and self.history and self.history[-1]["role"] == "user":
                yield random.choice(self.fillers)
            while True:
                task = await order.get()
                if task is None:
                    break
                yield await task
            await feeder
        finally:
            # Перебивание/ошибка: не ждём и не оплачиваем озвучку уже ненужных фраз.
            for task in (feeder, *started):
                task.cancel()
            await asyncio.gather(feeder, *started, return_exceptions=True)
