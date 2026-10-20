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
import json
import logging
import time
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
# Пометка в истории модели: метка в скобках — её не покажет TagFilter и не озвучит segments(), даже если модель повторит.
INTERRUPTED = "[перебили]"
BARGE_MOODS = {"тревожно", "паника", "плачет"}  # спокойный заявитель дослушивает оператора
MIN_VOICED_MS = 200  # щелчок/стук короче не отправляем в STT
MAX_UTTERANCE_MS = 15000
PREROLL_MS = 300


def configured() -> bool:
    settings = get_settings()
    key = settings.polza_api_key
    if settings.live_call_tts_engine == "silero":
        from ml.speech import tts as silero

        voice = bool(settings.live_call_silero_model and settings.live_call_silero_speaker
                     and silero.live_model_path(settings.live_call_silero_model).exists())
    else:
        voice = bool(settings.live_call_polza_tts_model)
    return bool(key and key.get_secret_value().strip()
                and settings.live_call_polza_chat_model and settings.live_call_polza_stt_model and voice
                and importlib.util.find_spec("torch") and vad.model_path().exists())


_voice_warm = False
_voice_lock = asyncio.Lock()


async def warm_voice() -> None:
    """Локальный голос: загрузка модели (~12 с) и первая озвучка (~5 с) — один раз на процесс,
    иначе первое приветствие звонка теряется. Облачному голосу прогрев не нужен."""
    global _voice_warm
    settings = get_settings()
    if settings.live_call_tts_engine != "silero" or _voice_warm:
        return
    async with _voice_lock:
        if _voice_warm:
            return
        from ml.speech import tts as silero

        await asyncio.to_thread(silero.synthesize_live, "Да.", settings.live_call_silero_model or "",
                                settings.live_call_silero_speaker or "")
        _voice_warm = True


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
        self.first_clause_from = 20  # первая фраза — до запятой: голос раньше на время дописывания предложения
        self.turn_mark: float | None = None  # конец речи оператора — для замера задержки ответа
        self.turn_marks: set[str] = set()
        self.item_audio_ms: dict[str, float] = {}  # сколько звука реплики ушло в браузер
        # Готовое перебивание ждёт порога: его события копятся здесь и не уходят в браузер.
        self.held: list[dict] | None = None
        self.held_rid = ""
        self.released_rid = ""


    async def __aenter__(self):
        settings = get_settings()
        if not (settings.polza_api_key and settings.polza_api_key.get_secret_value().strip()):
            raise ApiError(503, "internal", "Добавьте POLZA_API_KEY в backend/.env")
        self.detector = await asyncio.to_thread(vad.SpeechDetector)
        try:
            await warm_voice()  # до «ready»: иначе приветствие ждёт загрузку модели
        except Exception as exc:
            raise ApiError(503, "internal", "Локальный голос Silero недоступен: проверьте LIVE_CALL_SILERO_*") from exc
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(settings.polza_timeout_sec, connect=10),
                                        follow_redirects=False)
        await self.emit("session.created", session={"capabilities": {"turn_detection": ["server_vad"]}})
        return self

    async def __aexit__(self, *_args):
        tasks = [*self.transcriptions]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await super().__aexit__()


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
        if settings.live_call_polza_provider:
            options["provider"] = {"order": [settings.live_call_polza_provider], "allow_fallbacks": True}
        if settings.live_call_polza_reasoning_off:
            options["reasoning"] = {"enabled": False}
        elif settings.live_call_polza_reasoning_max_tokens:
            options["reasoning"] = {"max_tokens": settings.live_call_polza_reasoning_max_tokens}
        elif settings.live_call_polza_reasoning_effort:
            options["reasoning_effort"] = settings.live_call_polza_reasoning_effort
        return options

    async def reply_stream(self, messages: list[dict[str, str]]):
        """Сбой или пустой ответ до первого слова — один повтор; после — оставляем сказанное, звонок не рвём."""
        for attempt in (1, 2):
            produced = False
            try:
                async for delta in stream_reply(messages, self.client, self.llm_endpoint(), self.llm_options()):
                    if delta.strip():
                        produced = True
                    yield delta
                if produced or attempt == 2:
                    return
                logger.warning("Модель закончила ответ без слов; повторяем запрос")
            except ApiError:
                if produced:
                    logger.warning("Ответ заявителя оборван провайдером; сказанное сохранено")
                    return
                if attempt == 2:
                    raise

    async def release_barge(self) -> None:
        """Оператор говорит дольше порога: готовое перебивание звучит."""
        events, self.held, self.released_rid = self.held or [], None, self.held_rid
        logger.info("Заявитель перебивает длинную речь оператора")
        for event in events:
            await self.emit(event.pop("type"), **event)

    async def drop_barge(self) -> None:
        """Оператор договорил до порога: перебивание не прозвучало — ни в браузер, ни в память модели."""
        if self.held is None:
            return
        if self.response and not self.response.done():
            await self.cancel_response()
        for event in self.held:
            message = self.assistant_items.pop(event.get("item_id", ""), None)
            if message is not None:
                self.history = [item for item in self.history if item is not message]
        self.held = None
        logger.info("Перебивание не понадобилось: оператор договорил раньше порога")

    def on_interrupted(self, text: str) -> None:
        if self.held is not None:
            return  # перебивание ещё не звучало — оператор его не слышал
        # Оператор уже слышал начало: без этого модель «забывает» сказанное и здоровается заново.
        if text.strip():
            self.history.append({"role": "assistant", "content": text.rstrip() + "… " + INTERRUPTED})
            self.history = self.history[-16:]

    def text_filter(self):
        return persona.TagFilter()

    def reply_rules(self) -> str:
        # Метки настроения и звуков нужны озвучке; оператор их не видит (TagFilter).
        return ("Верни только произносимую реплику с метками из списка выше, без markdown и кавычек. "
                "Не читай названия полей карточки. Обращайся к оператору естественно.")

    async def send(self, raw: str):
        event = json.loads(raw)
        if event.get("type") != "conversation.item.truncate":
            return await super().send(raw)
        # Оператор заговорил поверх реплики. Раньше она удалялась из истории целиком, и модель,
        # не видя своего приветствия, на «Как вас зовут?» заново начинала звонок. Оставляем услышанное.
        item = str(event.get("item_id", ""))
        message = self.assistant_items.pop(item, None)
        total = self.item_audio_ms.pop(item, 0.0)
        heard = float(event.get("audio_end_ms") or 0)
        if message is None or not total or heard >= total * 0.95:
            return
        content = message["content"]
        cut = content.rfind(" ", 0, int(len(content) * heard / total))
        message["content"] = (content[:cut].rstrip(" ,") + "… " if cut > 0 else "") + INTERRUPTED

    async def emit(self, kind: str, **fields):
        if kind == "response.audio.delta":
            item = fields.get("item_id", "")
            self.item_audio_ms[item] = self.item_audio_ms.get(item, 0.0) + len(fields.get("delta", "")) * 3 / 4 / 48
        response = fields.get("response") if isinstance(fields.get("response"), dict) else {}
        rid = fields.get("response_id") or response.get("id", "")
        if kind == "response.created" and response.get("interrupting") and rid != self.released_rid:
            self.held, self.held_rid = [], rid
        if self.held is not None and rid and rid == self.held_rid:
            self.held.append({"type": kind, **fields})
            return
        # Замер хода: от конца речи оператора до первого слова модели и первого звука (без текста реплик).
        if self.turn_mark is not None and kind in ("response.text.delta", "response.audio.delta"):
            stage = "первое слово" if kind == "response.text.delta" else "первый звук"
            if stage not in self.turn_marks:
                self.turn_marks.add(stage)
                logger.info("Ход заявителя: %s через %d мс после конца речи оператора", stage,
                            (time.monotonic() - self.turn_mark) * 1000)
            if stage == "первый звук":
                self.turn_mark = None
        await super().emit(kind, **fields)

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

    async def commit(self, item_id: str, pcm: bytes, turn_end: asyncio.Event, speech_end: float):
        """Распознавание может стартовать до конца реплики (ранняя пауза); в разговор текст
        попадает только после turn_end, а если оператор продолжил говорить — задача отменяется."""
        try:
            # Реплики распознаются по порядку: поздний ответ STT не обгоняет более раннюю фразу.
            async with self.stt_lock:
                started = time.monotonic()
                text = await self.transcribe(pcm)
                request_ms = (time.monotonic() - started) * 1000
            await turn_end.wait()
            logger.info("Ход оператора: распознавание готово через %d мс после конца речи (запрос %d мс)",
                        (time.monotonic() - speech_end) * 1000, request_ms)
            if not text:
                return
            await self.emit("input_audio_buffer.committed", item_id=item_id)
            await self.emit("conversation.item.input_audio_transcription.completed", item_id=item_id, transcript=text)
            self.history.append({"role": "user", "content": text})
            self.history = self.history[-16:]
            await self.cancel_response()
            self.turn_mark, self.turn_marks = speech_end, set()
            self.response = asyncio.create_task(self.respond())
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            message = exc.message if isinstance(exc, ApiError) else "Распознавание речи прервалось. Подключитесь повторно"
            await self.emit("error", code="polza", message=message)

    async def barge_in(self, item_id: str, pcm: bytes):
        """Оператор говорит долго: распознаём услышанное и перебиваем по смыслу, пока он ещё говорит."""
        try:
            async with self.stt_lock:
                text = await self.transcribe(pcm)
            if not text or not self.speaking or self.item_id != item_id:
                return
            logger.info("Перебивание готовится: распознано начало длинной речи оператора")
            await self.cancel_response()
            self.response = asyncio.create_task(self.respond(barge=text))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("Перебивание пропущено: распознавание не ответило")

    async def listen(self):
        settings = get_settings()
        preroll: deque[bytes] = deque()
        utterance = bytearray()
        voiced_ms = 0.0
        early: asyncio.Task | None = None  # распознавание, начатое на ранней паузе
        turn_end = asyncio.Event()
        barge: asyncio.Task | None = None  # перебивание длинной речи оператора
        barged = False

        def start_commit(event: asyncio.Event) -> asyncio.Task:
            task = asyncio.create_task(self.commit(self.item_id, bytes(utterance), event,
                                                   time.monotonic() - self.silent_ms / 1000))
            self.transcriptions.add(task)
            task.add_done_callback(self.transcriptions.discard)
            return task

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
                    barged = False
                    await self.emit("input_audio_buffer.speech_started", item_id=self.item_id)
                    await self.cancel_response()
                    continue
                utterance += pcm
                voiced_ms += duration if voiced else 0
                self.silent_ms = 0 if voiced else self.silent_ms + duration
                barge_ms = settings.live_call_barge_in_sec * 1000
                prepare_ms = min(settings.live_call_barge_prepare_sec * 1000, barge_ms)
                # Пороги — по времени речи, без пауз между фразами.
                if not barged and barge_ms and voiced_ms >= prepare_ms:
                    barged = True
                    if self.mood not in BARGE_MOODS:
                        logger.info("Перебивания не будет: заявитель «%s» дослушивает оператора", self.mood)
                    elif self.response is not None and not self.response.done():
                        logger.info("Перебивания не будет: заявитель ещё говорит")
                    else:
                        barge = asyncio.create_task(self.barge_in(self.item_id, bytes(utterance)))
                        self.transcriptions.add(barge)
                        barge.add_done_callback(self.transcriptions.discard)
                if self.held is not None and voiced_ms >= barge_ms:
                    await self.release_barge()
                if voiced and early is not None:
                    early.cancel()  # оператор продолжил фразу: распознаем её целиком
                    early = None
                end_ms, early_ms = settings.live_call_end_silence_ms, settings.live_call_early_commit_ms
                if (early is None and 0 < early_ms < end_ms and self.silent_ms >= early_ms
                        and voiced_ms >= MIN_VOICED_MS):
                    turn_end = asyncio.Event()
                    early = start_commit(turn_end)
                if self.silent_ms < end_ms and len(utterance) < MAX_UTTERANCE_MS * 32:
                    continue
                if voiced_ms >= MIN_VOICED_MS:
                    if early is None:
                        turn_end = asyncio.Event()
                        start_commit(turn_end)
                    turn_end.set()
                early = None
                if barge is not None and not barge.done():
                    barge.cancel()  # оператор договорил раньше, чем распознали начало: будет обычный ответ
                    logger.info("Перебивание не успело: оператор договорил раньше, чем распознали начало")
                barge = None
                await self.drop_barge()
                self.speaking, self.onset_ms, self.silent_ms = False, 0, 0
                await self.emit("input_audio_buffer.speech_stopped", item_id=self.item_id)
                utterance = bytearray()
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.emit("error", code="polza", message="Распознавание речи прервалось. Подключитесь повторно")

    # --- озвучка: текст без меток + инструкция эмоции, неречевые звуки — вставками ---
    async def tts(self, text: str, mood: str | None = None) -> bytes:
        settings = get_settings()
        if settings.live_call_tts_engine == "silero":
            from ml.speech import tts as silero

            rate, pitch = persona.PROSODY[mood or self.mood]
            try:
                return await asyncio.to_thread(silero.synthesize_live, text, settings.live_call_silero_model or "",
                                               settings.live_call_silero_speaker or "", rate, pitch)
            except Exception as exc:
                raise ApiError(503, "internal", "Локальный голос Silero недоступен: проверьте LIVE_CALL_SILERO_*") from exc
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
