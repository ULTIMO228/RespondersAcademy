"""Непрерывный PCM → Vosk → потоковый LLM API → Silero PCM. Без файлов и GPU."""
from __future__ import annotations

import asyncio
import base64
import importlib.util
import json
import logging
import re
import time
from contextlib import aclosing, suppress
from uuid import uuid4

import httpx
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from ml.speech import stt, tts, vad

logger = logging.getLogger(__name__)
STILL_TALKING = "[оператор ещё говорит]"  # пометка для модели: реплика оператора не закончена


def configured() -> bool:
    settings = get_settings()
    return bool(settings.live_call_llm_url and settings.live_call_llm_api_key
                and settings.live_call_llm_api_key.get_secret_value()
                and stt.model_path().exists() and tts.model_path().exists() and vad.model_path().exists()
                and importlib.util.find_spec("vosk") and importlib.util.find_spec("torch"))


def warmup():
    """Загрузка на старте звонка; модель TTS разогревается без вывода звука."""
    from vosk import KaldiRecognizer

    recognizer = KaldiRecognizer(stt._model(), 16000)
    tts.synthesize_pcm("Да.")
    return recognizer


def llm_endpoint() -> tuple[str, SecretStr | None, str, str]:
    """(base URL, ключ, модель, имя провайдера в сообщениях) разговорной модели каскада."""
    settings = get_settings()
    return settings.live_call_llm_url or "", settings.live_call_llm_api_key, settings.live_call_llm_model, "Groq"


async def stream_reply(messages: list[dict[str, str]], client: httpx.AsyncClient,
                       endpoint: tuple[str, SecretStr | None, str, str] | None = None,
                       options: dict | None = None):
    """options — параметры запроса провайдера; None — прежнее поведение каскада (Groq/Qwen)."""
    url, key, model, provider = endpoint or llm_endpoint()
    if key is None:
        raise ApiError(503, "internal", "Не настроен доступ к разговорной модели")
    # После отмены ответа возможны соседние user-сообщения. Развёрнутый Qwen в Groq
    # принимает такой запрос, но возвращает пустой stop; объединяем их без потери контекста.
    normalized: list[dict[str, str]] = []
    for message in messages:
        if normalized and normalized[-1]["role"] == message["role"] == "user":
            normalized[-1]["content"] += "\nСледующая реплика оператора: " + message["content"]
        else:
            normalized.append(dict(message))
    body = {"model": model, "messages": normalized,
            "stream": True, "temperature": 0.3, "max_completion_tokens": 180}
    if options is not None:
        body.update(options)
    elif "qwen" in model.lower():
        # У Qwen в Groq reasoning выключен для коротких ответов по телефону.
        body["reasoning_effort"] = "none"
    try:
        async with client.stream("POST", url.rstrip("/") + "/chat/completions",
                                 headers={"Authorization": "Bearer " + key.get_secret_value()}, json=body) as response:
            if response.status_code == 429:
                raise ApiError(503, "internal", f"Достигнут лимит {provider}. Повторите подключение позже")
            if response.status_code == 402:
                raise ApiError(503, "internal", f"У {provider} недостаточно средств для разговорной модели")
            if response.status_code in (401, 403):
                raise ApiError(503, "internal", f"{provider} отклонил доступ к разговорной модели")
            if not response.is_success:
                raise ApiError(503, "internal", "Разговорная модель отклонила запрос")
            finished = False
            reasons: list[str] = []
            error = ""
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                event = json.loads(payload)
                if isinstance(event.get("error"), dict):
                    error = str(event["error"].get("code") or event["error"].get("type") or "error")[:60]
                for choice in event.get("choices", []):
                    if choice.get("finish_reason"):
                        reasons.append(str(choice["finish_reason"])[:30])
                    if choice.get("finish_reason") == "stop":
                        finished = True
                    delta = choice.get("delta", {}).get("content")
                    if isinstance(delta, str) and delta:
                        yield delta
            if not finished:
                # Только служебные поля: без текста реплик и ключей.
                logger.warning("Поток %s закончился без stop: finish=%s error=%s", provider, reasons or "—", error or "—")
                raise ApiError(503, "internal", "Модель не закончила ответ. Повторите подключение")
    except httpx.HTTPError as exc:
        raise ApiError(503, "internal", "Нет связи с разговорной моделью") from exc


ABBREVIATIONS = {"ул", "д", "корп", "стр", "кв", "под", "эт", "г", "им", "пр", "пер", "наб", "обл", "т", "е"}
ADDRESS_WORDS = {"улица", "дом", "корпус", "строение", "квартира", "подъезд", "этаж", "проспект", "переулок",
                 "набережная", "шоссе", "бульвар", "проезд", "площадь", "телефон", "номер"}


def take_clause(buffer: str, clause_from: int) -> tuple[str, str]:
    """Первая фраза ответа — до запятой: голос звучит, пока модель дописывает предложение.
    Адрес, номера и телефоны по запятой не режем — там интонация и цифры должны остаться целыми."""
    for match in re.finditer(r",\s", buffer):
        if match.start() < clause_from:
            continue
        head, tail = buffer[:match.start() + 1], buffer[match.end():]
        words = {word.lower() for word in re.findall(r"[\w-]+", head + " " + tail.split(" ", 1)[0])}
        if re.search(r"\d", head) or words & (ABBREVIATIONS | ADDRESS_WORDS):
            return "", buffer
        return head.strip(), tail.lstrip()
    return "", buffer


def take_phrase(buffer: str, clause_from: int | None = None) -> tuple[str, str]:
    """Передаём предложения целиком: не рубим адрес/число/сокращение на токенах.
    clause_from — для первой фразы ответа: допускается граница по запятой не раньше этого символа."""
    abbreviations = ABBREVIATIONS
    for match in re.finditer(r"[.!?]+(?=\s|$)", buffer):
        end = match.end()
        if buffer[match.start()] == ".":
            # Одиночная точка в конце пришедшего токена ещё может стать «12.5» или «ул.».
            if end == len(buffer):
                continue
            word = re.search(r"([\w-]+)\.$", buffer[:end])
            if word and (word[1].lower() in abbreviations or len(word[1]) == 1):
                continue
        return buffer[:end].strip(), buffer[end:].lstrip()
    if len(buffer) >= 260:
        # Защитная граница для редкого длинного предложения, предпочтительно по запятой.
        split = max(buffer.rfind(", ", 100, 260), buffer.rfind("; ", 100, 260))
        if split >= 0:
            split += 1
        else:
            split = buffer.rfind(" ", 100, 260)
        if split > 0:
            return buffer[:split].strip(), buffer[split:].lstrip()
    if clause_from is not None:
        return take_clause(buffer, clause_from)
    return "", buffer


class CascadeSession:
    """Тот же внутренний event-протокол, что у удалённого omni-сервера."""
    def __init__(self):
        self.events: asyncio.Queue[dict] = asyncio.Queue(maxsize=128)
        self.audio: asyncio.Queue[bytes] = asyncio.Queue(maxsize=100)
        self.recognizer = None
        self.detector = None
        self.client: httpx.AsyncClient | None = None
        self.listener: asyncio.Task | None = None
        self.response: asyncio.Task | None = None
        self.history: list[dict[str, str]] = []
        self.assistant_items: dict[str, dict[str, str]] = {}
        self.instructions = ""
        self.speaking = False
        self.onset_ms = 0.0
        self.silent_ms = 0.0
        self.item_id = ""
        self.closed = False
        # Первая фраза ответа может закончиться запятой не раньше этого символа (None — только предложения).
        self.first_clause_from: int | None = None

    async def __aenter__(self):
        self.recognizer = await asyncio.to_thread(warmup)
        self.detector = await asyncio.to_thread(vad.SpeechDetector)
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10), follow_redirects=False)
        await self.emit("session.created", session={"capabilities": {"turn_detection": ["server_vad"]}})
        return self

    async def __aexit__(self, *_args):
        self.closed = True
        tasks = [task for task in (self.listener, self.response) if task]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if self.client:
            await self.client.aclose()

    async def emit(self, kind: str, **fields):
        if not self.closed:
            await self.events.put({"type": kind, **fields})

    async def recv(self):
        return json.dumps(await self.events.get(), ensure_ascii=False)

    async def send(self, raw: str):
        event = json.loads(raw)
        if event["type"] == "session.update":
            self.instructions = event["session"]["instructions"] + "\n" + self.reply_rules()
            await self.emit("session.updated", session={"modalities": ["text", "audio"]})
            self.listener = asyncio.create_task(self.listen())
            self.response = asyncio.create_task(self.respond(initial=True))
        elif event["type"] == "input_audio_buffer.append":
            await self.audio.put(base64.b64decode(event["audio"], validate=True))
        elif event["type"] == "conversation.item.truncate":
            previous = self.assistant_items.pop(event["item_id"], None)
            if previous is not None:
                self.history = [message for message in self.history if message is not previous]

    def recognize(self, pcm: bytes) -> tuple[bool, str, bool]:
        voiced = self.detector.push(pcm) >= (0.35 if self.speaking else 0.65)
        accepted = bool(self.recognizer.AcceptWaveform(pcm))
        result = self.recognizer.Result() if accepted else self.recognizer.PartialResult()
        return accepted, str(json.loads(result).get("text" if accepted else "partial", "")).strip(), voiced

    def finalize(self) -> str:
        text = str(json.loads(self.recognizer.FinalResult()).get("text", "")).strip()
        self.recognizer.Reset()
        return text

    async def cancel_response(self):
        if self.response and not self.response.done():
            self.response.cancel()
            with suppress(asyncio.CancelledError):
                await self.response
        self.response = None

    async def listen(self):
        try:
            while True:
                pcm = await self.audio.get()
                # ASR работает порциями до 80 мс, а не отдельными записанными репликами.
                while self.audio.qsize() and len(pcm) < 2560:
                    pcm += self.audio.get_nowait()
                duration = len(pcm) / 32
                accepted, text, voiced = await asyncio.to_thread(self.recognize, pcm)
                if not self.speaking:
                    self.onset_ms = self.onset_ms + duration if voiced else 0
                    if self.onset_ms >= 96:
                        self.speaking = True
                        self.silent_ms = 0
                        self.item_id = "input-" + uuid4().hex
                        await self.emit("input_audio_buffer.speech_started", item_id=self.item_id)
                        await self.cancel_response()
                if not self.speaking:
                    continue
                self.silent_ms = 0 if voiced else self.silent_ms + duration
                if text:
                    await self.emit("conversation.item.input_audio_transcription.delta", item_id=self.item_id, delta=text)
                if accepted or self.silent_ms >= 400:
                    final = text if accepted else await asyncio.to_thread(self.finalize)
                    self.speaking = False
                    self.onset_ms = 0
                    self.silent_ms = 0
                    await self.emit("input_audio_buffer.speech_stopped", item_id=self.item_id)
                    if not final:
                        continue
                    await self.emit("input_audio_buffer.committed", item_id=self.item_id)
                    await self.emit("conversation.item.input_audio_transcription.completed", item_id=self.item_id, transcript=final)
                    self.history.append({"role": "user", "content": final})
                    self.history = self.history[-16:]
                    self.response = asyncio.create_task(self.respond())
        except asyncio.CancelledError:
            raise
        except Exception:
            await self.emit("error", code="cascade", message="Распознавание речи прервалось. Подключитесь повторно")

    def llm_endpoint(self) -> tuple[str, SecretStr | None, str, str]:
        return llm_endpoint()

    def llm_options(self) -> dict | None:
        return None

    def on_interrupted(self, text: str) -> None:
        """Ответ отменён (перебивание); каскад прежнему поведению не меняет."""

    async def reply_stream(self, messages: list[dict[str, str]]):
        async for delta in stream_reply(messages, self.client, self.llm_endpoint(), self.llm_options()):
            yield delta

    def reply_rules(self) -> str:
        return ("Верни только произносимую реплику, без markdown, кавычек и служебных меток. "
                "Не читай названия полей карточки. Обращайся к оператору естественно.")

    def text_filter(self):
        """Фильтр показываемого текста (feed/flush); None — показывать как есть."""
        return None

    async def synthesize(self, phrases: asyncio.Queue[str | None]):
        """Локальный TTS; облачный конвейер переопределяет этот поток."""
        while True:
            phrase = await phrases.get()
            if phrase is None:
                return
            yield await asyncio.to_thread(tts.synthesize_pcm, phrase)

    async def respond(self, initial: bool = False, barge: str | None = None):
        """barge — начало ещё не законченной речи оператора: заявитель перебивает его."""
        rid, item = "response-" + uuid4().hex, "caller-" + uuid4().hex
        phrases: asyncio.Queue[str | None] = asyncio.Queue(maxsize=3)
        text = ""
        await self.emit("response.created", response={"id": rid, **({"interrupting": True} if barge else {})})

        async def generate():
            nonlocal text
            buffer = ""
            spoken = False
            shown = self.text_filter()
            messages = [{"role": "system", "content": self.instructions}, *self.history]
            if initial:
                messages.append({"role": "user", "content": "Соединение установлено. Начни звонок как заявитель: коротко поздоровайся и своими словами попроси помощь по происшествию. Не перечисляй адрес и контакты заранее."})
            if barge:
                messages.append({"role": "user", "content": barge + " " + STILL_TALKING})
            async for delta in self.reply_stream(messages):
                text += delta
                buffer += delta
                visible = shown.feed(delta) if shown else delta
                if visible:
                    await self.emit("response.text.delta", response_id=rid, delta=visible)
                phrase, buffer = take_phrase(buffer, None if spoken else self.first_clause_from)
                while phrase:
                    spoken = True
                    await phrases.put(phrase)
                    phrase, buffer = take_phrase(buffer)
                if len(text) > 600:
                    raise ApiError(503, "internal", "Модель превысила длину телефонного ответа")
            tail = shown.flush() if shown else ""
            if tail:
                await self.emit("response.text.delta", response_id=rid, delta=tail)
            if buffer.strip():
                await phrases.put(buffer.strip())
            await phrases.put(None)

        async def speak():
            queued_until = time.monotonic()
            async with aclosing(self.synthesize(phrases)) as audio:
                async for pcm in audio:
                    for offset in range(0, len(pcm), 9600):
                        # Не копим секунды устаревшего ответа в браузере.
                        ahead = queued_until - time.monotonic()
                        if ahead > 0.6:
                            await asyncio.sleep(ahead - 0.6)
                        chunk = pcm[offset:offset + 9600]
                        await self.emit("response.audio.delta", response_id=rid, item_id=item,
                                        delta=base64.b64encode(chunk).decode())
                        queued_until = max(queued_until, time.monotonic()) + len(chunk) / 48000

        tasks = [asyncio.create_task(generate()), asyncio.create_task(speak())]
        try:
            # FIRST_EXCEPTION завершает оба потока при ошибке, но ждёт оба при успехе.
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
            for task in done:
                task.result()
            if not text.strip():
                raise ApiError(503, "internal", "Модель вернула пустой ответ")
            message = {"role": "assistant", "content": text}
            self.history.append(message)
            self.assistant_items[item] = message
            await self.emit("response.audio.done", response_id=rid)
            await self.emit("response.done", response={"id": rid, "status": "completed"})
        except asyncio.CancelledError:
            self.on_interrupted(text)
            await self.emit("response.done", response={"id": rid, "status": "cancelled"})
            raise
        except Exception as exc:
            message = exc.message if isinstance(exc, ApiError) else "Озвучка заявителя прервалась. Подключитесь повторно"
            await self.emit("error", code="cascade", message=message)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
