"""Живой заявитель: манера речи, метки настроения/звуков и их подготовка к озвучке.

Модель пишет реплику с метками в квадратных скобках: настроение в начале
([спокойно], [тревожно], [паника], [плачет]) и редкие неречевые звуки
([вздох], [всхлип], [кашель], [тяжело дышит], [пауза]). Метки не показываются
оператору и не попадают в транскрипт; озвучка получает текст без меток,
инструкцию эмоции и (если есть библиотека звуков) короткие вставки.
"""
from __future__ import annotations

import random
import re
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24000

MOODS = {
    "спокойно": "Говори спокойно, но с лёгким волнением, как обычный человек, который звонит в службу 112.",
    "тревожно": "Говори взволнованно и торопливо, с тревогой в голосе, как напуганный человек, который звонит в 112.",
    "паника": "Говори в панике: быстро, сбивчиво, на высоком тоне, со сбитым дыханием, иногда повторяя слова.",
    "плачет": "Говори сквозь слёзы: дрожащим голосом, всхлипывая, с паузами между фразами.",
}
DEFAULT_MOOD = "тревожно"
# Для локального голоса без инструкций (Silero): настроение → темп и высота (SSML prosody).
PROSODY = {"спокойно": ("medium", "medium"), "тревожно": ("fast", "medium"),
           "паника": ("fast", "high"), "плачет": ("slow", "low")}

# Неречевой звук → (папка с вставками, текст-замена, тишина в мс) — замена, если вставок нет.
SOUNDS = {
    "вздох": ("sigh", "Ох…", 0),
    "всхлип": ("sob", "", 400),
    "кашель": ("cough", "Кхе-кхе…", 0),
    "тяжело дышит": ("breath", "Ха… ха…", 0),
    "пауза": ("", "", 500),
}

TAG = re.compile(r"\[([а-яё ]{3,20})\]", re.IGNORECASE)

STYLE = (
    "Говори как живой взволнованный человек по телефону, а не как анкета или протокол: разговорно, простыми "
    "фразами, как сказал бы вслух. Ответь на вопрос и добавь своё, человеческое: что чувствуешь, чего "
    "боишься, о чём переживаешь, спроси оператора («а долго ещё ждать?», «а мне что делать?»), поблагодари, "
    "попроси поторопиться. Междометия («ой», «господи», «ну…») и многоточия — изредка и к месту, "
    "не в каждой реплике. Волнение сдержанное: ты встревожен, но говоришь связно. Метка [паника] — только "
    "при прямой угрозе жизни, обычно [тревожно]. Не переигрывай: эмоции соразмерны происшествию. Когда оператор "
    "говорит уверенно и по делу, постепенно успокаивайся; если тебя долго не понимают или переспрашивают "
    "одно и то же — нервничай сильнее. Чувства, страх, вопросы и просьбы — можно; новые события, люди "
    "и подробности, которых нет в фактах, — нельзя.\n"
    "Примеры манеры (только тон, не факты):\n"
    "Оператор: «Пострадавшие есть?» — Ты: «[тревожно] Не знаю, отсюда не видно. Вы же быстро приедете?»\n"
    "Оператор: «Успокойтесь, помощь уже едет.» — Ты: «[тревожно] Да… да, хорошо. Спасибо вам. "
    "Просто страшно очень, понимаете?»\n"
    "Оператор: «Вы меня слышите?» — Ты: «[тревожно] Да, слышу. Говорите.»\n"
    "Конец примеров.\n"
    "Адрес, номера домов и организаций, этажи, имена и телефоны называй точно как в фактах, без оговорок "
    "и «исправлений»; числа — полностью словами («номер 193» — «номер сто девяносто три»), телефон диктуй "
    "по группам цифр, как он записан. Не придумывай, где ты стоишь и откуда смотришь, если этого нет в фактах.\n"
    "Если реплика оператора заканчивается пометкой [оператор ещё говорит], он не договорил, а ты не "
    "выдержал: перебей одной короткой фразой по своей беде — поторопи, спроси, что делать, или скажи, "
    "что стало хуже. На всё сказанное не отвечай, не здоровайся.\n"
    "Если вместо реплики оператора пометка [оператор молчит], он молчит уже несколько секунд (может быть, "
    "записывает): скажи одну короткую фразу — проверь связь, спроси, едут ли, или своими словами напомни "
    "главное. Новых фактов не придумывай и не повторяй дословно свои прошлые фразы.\n"
    "Начинай каждую реплику меткой настроения: [спокойно], [тревожно], [паника] или [плачет]. "
    "Звуки, которые нельзя сказать словами, обозначай только метками из списка: [вздох], [всхлип], "
    "[кашель], [тяжело дышит], [пауза] — не больше двух на реплику. Других скобок, ремарок "
    "и описаний действий не используй."
)


def strip_tags(text: str) -> str:
    """Текст для транскрипта и показа: без меток, без двойных пробелов."""
    return re.sub(r"\s{2,}", " ", TAG.sub(" ", text)).strip()


class TagFilter:
    """Потоковая очистка: метка может прийти по частям в соседних токенах."""

    def __init__(self) -> None:
        self.pending = ""
        self.started = False
        self.space = False

    def feed(self, delta: str, final: bool = False) -> str:
        text = self.pending + delta
        self.pending = ""
        start = text.rfind("[")
        if not final and start >= 0 and "]" not in text[start:] and len(text) - start <= 22:
            text, self.pending = text[:start], text[start:]
        clean = re.sub(r"\s{2,}", " ", TAG.sub("", text))
        # Пробел на краю придерживаем: после удалённой метки он может оказаться
        # лишним (в начале, в конце реплики или рядом с другим пробелом).
        body = clean.strip()
        if not body:
            self.space = self.space or bool(clean)
            return ""
        prefix = " " if self.started and (self.space or clean[0].isspace()) else ""
        self.started, self.space = True, clean[-1].isspace()
        return prefix + body

    def flush(self) -> str:
        tail, self.pending = self.pending, ""
        return self.feed(tail, final=True) if tail else ""


@dataclass
class Segment:
    kind: str  # "speech" | "sound" | "silence"
    text: str = ""
    path: Path | None = None
    ms: int = 0


def segments(phrase: str, sounds_dir: Path | None, mood: str) -> tuple[list[Segment], str]:
    """Разбить фразу на речь/звуки и обновить настроение по метке."""
    result: list[Segment] = []
    position = 0
    for match in TAG.finditer(phrase):
        before = phrase[position:match.start()]
        position = match.end()
        tag = match[1].lower().strip()
        if tag in MOODS:
            mood = tag
            _speech(result, before)
            continue
        if tag not in SOUNDS:
            _speech(result, before)  # неизвестная метка — просто не озвучиваем
            continue
        folder, replacement, silence = SOUNDS[tag]
        clip = _clip(sounds_dir, folder)
        if clip is not None:
            _speech(result, before)
            result.append(Segment("sound", path=clip))
        elif replacement:
            _speech(result, before + " " + replacement + " ")
        else:
            _speech(result, before)
            result.append(Segment("silence", ms=silence))
    _speech(result, phrase[position:])
    return result, mood


def _speech(result: list[Segment], text: str) -> None:
    text = re.sub(r"\s{2,}", " ", text).strip()
    if not re.search(r"\w", text):
        return
    if result and result[-1].kind == "speech":
        result[-1].text += " " + text
    else:
        result.append(Segment("speech", text=text))


def _clip(sounds_dir: Path | None, folder: str) -> Path | None:
    if not sounds_dir or not folder:
        return None
    candidates = sorted((sounds_dir / folder).glob("*.wav"))
    return random.choice(candidates) if candidates else None


def silence(ms: int) -> bytes:
    return b"\0\0" * (SAMPLE_RATE * ms // 1000)


def wav_to_pcm24(data: bytes) -> bytes:
    """WAV любого моно/стерео 16-бит → моно PCM16 24 кГц для браузера."""
    import io

    with wave.open(io.BytesIO(data)) as source:
        if source.getsampwidth() != 2:
            raise ValueError("Ожидается 16-битный WAV")
        channels, rate = source.getnchannels(), source.getframerate()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if rate != SAMPLE_RATE and len(samples):
        count = max(1, round(len(samples) * SAMPLE_RATE / rate))
        samples = np.interp(np.linspace(0, len(samples) - 1, count), np.arange(len(samples)), samples)
    return np.clip(samples, -32768, 32767).astype("<i2").tobytes()


def pcm16_to_wav(pcm: bytes, rate: int = 16000) -> bytes:
    import io

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm)
    return buffer.getvalue()
