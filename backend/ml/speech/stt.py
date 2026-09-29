"""Lazy offline Vosk recognizer for mono PCM WAV voice reports."""

from __future__ import annotations

import io
import json
import wave
from functools import lru_cache
from pathlib import Path

from app.config import get_settings

MAX_WAV_BYTES = 20 * 1024 * 1024
NUMBERS = [str(number) for number in range(0, 101)] + [
    "ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
    "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать", "двадцать", "тридцать",
    "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто", "сто",
]
SERVICES = ["служба 101", "служба 102", "служба 103", "служба 104", "Мосгаз", "Мосводоканал", "МЧС", "полиция", "скорая помощь"]


class SpeechUnavailable(RuntimeError):
    """The optional Vosk package or local Russian model is absent."""


def model_path() -> Path:
    root = get_settings().models_dir
    candidates = [root / "vosk-model-small-ru-0.22", root / "vosk-small-ru", *sorted(root.glob("vosk-model-small-ru-*"))]
    return next((path for path in candidates if path.is_dir() and (path / "am").exists()), candidates[0])


@lru_cache(maxsize=1)
def _model():
    path = model_path()
    if not path.is_dir():
        raise SpeechUnavailable(f"Локальная модель Vosk small-ru не найдена: {path}")
    try:
        from vosk import Model, SetLogLevel
    except ImportError as exc:
        raise SpeechUnavailable("Для распознавания установите optional dependency backend[stt]") from exc
    SetLogLevel(-1)
    return Model(str(path))


@lru_cache(maxsize=1)
def domain_grammar() -> list[str]:
    path = get_settings().seed_dir / "mocks" / "local" / "addresses.json"
    streets: list[str] = []
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data if isinstance(data, list) else data.get("addresses", [])
        streets = [str(row.get("street") or row.get("name") or "") for row in rows if isinstance(row, dict)]
    return [*SERVICES, *NUMBERS, *[street for street in streets if street], "[unk]"]


def _recognize(model: object, rate: int, data: bytes, grammar: list[str] | None = None) -> str:
    from vosk import KaldiRecognizer

    recognizer = (KaldiRecognizer(model, rate) if grammar is None else
                  KaldiRecognizer(model, rate, json.dumps(grammar, ensure_ascii=False)))
    parts: list[str] = []
    for offset in range(0, len(data), 8000):
        if recognizer.AcceptWaveform(data[offset:offset + 8000]):
            parts.append(json.loads(recognizer.Result()).get("text", ""))
    parts.append(json.loads(recognizer.FinalResult()).get("text", ""))
    return " ".join(part for part in parts if part).strip()


def transcribe(wav: bytes) -> str:
    if not wav or len(wav) > MAX_WAV_BYTES:
        raise ValueError("WAV должен быть непустым и не больше 20 МБ")
    try:
        with wave.open(io.BytesIO(wav), "rb") as source:
            if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() not in (8000, 16000):
                raise ValueError("Ожидается моно PCM WAV 16 бит, 8 или 16 кГц")
            rate = source.getframerate()
            data = source.readframes(source.getnframes())
            model = _model()
            # Жёсткая грамматика превращает свободный доклад в числа и названия служб.
            # Сначала распознаём речь целиком; словарь помогает только если свободный проход пуст.
            return _recognize(model, rate, data) or _recognize(model, rate, data, domain_grammar())
    except (wave.Error, EOFError) as exc:
        raise ValueError("Некорректный WAV-файл") from exc
