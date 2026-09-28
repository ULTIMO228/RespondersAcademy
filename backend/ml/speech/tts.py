"""TTS для аудиозаписи обращения (FR-012/013): Silero v4 ru на CPU, офлайн, лениво.

Модель `MODELS_DIR/silero/v4_ru.pt` (≈50 МБ, `uv run python -m ml.scripts.prepare_models --only tts`; torch — extra `nlp`
или `tts`). Голоса: male → aidar, female → kseniya. Silero ru не озвучивает цифры, поэтому числа переводятся в слова
(телефон — по цифрам). Без модели `available()` — False, а `synthesize` бросает `TtsUnavailable`: сервис помечает запись
`failed` и отдаёт расшифровку с пометкой «аварийный режим» (T085).
"""

from __future__ import annotations

import re
import threading
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MODEL_FILE = "v4_ru.pt"
MODEL_SUBDIR = "silero"
MODEL_URL = "https://models.silero.ai/models/tts/ru/v4_ru.pt"
SAMPLE_RATE = 24_000
SPEAKERS = {"male": "aidar", "female": "kseniya"}
MAX_CHUNK_CHARS = 800
_lock = threading.Lock()
_model = None
_load_error: str | None = None

_UNITS = ("", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять")
_UNITS_F = ("", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять")
_TEENS = ("десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать")
_TENS = ("", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто")
_HUNDREDS = ("", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот")
_DIGIT_WORDS = ("ноль", *_UNITS[1:])
_PHONE = re.compile(r"(?<!\w)(?:\+?7|8)?[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\w)|(?<!\w)\d{7,11}(?!\w)")
_NUMBER = re.compile(r"\d+")
_ORDINAL = re.compile(r"(\d+)-(?:го|му|ая|ое|ый|ой|ых|ми|й|я|е|м)(?![а-яё])")


class TtsUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Synthesis:
    path: Path
    duration_ms: int
    speaker: str


def model_path() -> Path:
    from app.config import get_settings

    return get_settings().models_dir / MODEL_SUBDIR / MODEL_FILE


def available() -> bool:
    if not model_path().exists():
        return False
    try:
        import torch  # noqa: F401
    except ImportError:
        return False
    return True


def unavailable_reason() -> str | None:
    if not model_path().exists():
        return f"нет модели {model_path()} (prepare_models --only tts)"
    try:
        import torch  # noqa: F401
    except ImportError:
        return "torch не установлен (uv sync --extra nlp)"
    return _load_error


def reset() -> None:
    global _model, _load_error
    with _lock:
        _model, _load_error = None, None


def _load():
    global _model, _load_error
    with _lock:
        if _model is not None:
            return _model
        if not model_path().exists():
            raise TtsUnavailable(unavailable_reason() or "модель TTS недоступна")
        try:
            import torch

            torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
            importer = torch.package.PackageImporter(str(model_path()))
            _model = importer.load_pickle("tts_models", "model")
            _model.to(torch.device("cpu"))
        except Exception as exc:  # noqa: BLE001 — любая ошибка загрузки → аварийный режим с расшифровкой
            _load_error = f"{type(exc).__name__}: {exc}"
            raise TtsUnavailable(_load_error) from exc
        return _model


def number_to_words(value: int, feminine: bool = False) -> str:
    """0..999 999 → слова (для номеров домов, возрастов, этажей)."""
    if value == 0:
        return "ноль"
    if value >= 1_000_000:
        return " ".join(_DIGIT_WORDS[int(d)] for d in str(value))
    words: list[str] = []
    thousands, rest = divmod(value, 1000)
    if thousands:
        words.append(_triplet(thousands, feminine=True))
        words.append("тысяча" if thousands % 10 == 1 and thousands % 100 != 11 else "тысячи" if 2 <= thousands % 10 <= 4 and not 12 <= thousands % 100 <= 14 else "тысяч")
    if rest:
        words.append(_triplet(rest, feminine))
    return " ".join(w for w in words if w)


def _triplet(value: int, feminine: bool = False) -> str:
    hundreds, rest = divmod(value, 100)
    tens, units = divmod(rest, 10)
    parts = [_HUNDREDS[hundreds]]
    if 10 <= rest <= 19:
        parts.append(_TEENS[rest - 10])
    else:
        parts.append(_TENS[tens])
        parts.append((_UNITS_F if feminine else _UNITS)[units])
    return " ".join(p for p in parts if p)


def phone_to_words(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    groups = [digits[:3], digits[3:6], digits[6:8], digits[8:]] if len(digits) == 10 else [digits]
    return ", ".join(" ".join(_DIGIT_WORDS[int(d)] for d in g) for g in groups if g)


def prepare_text(text: str) -> str:
    """Числа → слова: телефоны по цифрам, остальное — количественно; «112» уже озвучено в шаблоне словами."""
    text = _PHONE.sub(lambda m: (" " if m.group(0)[:1].isspace() else "") + phone_to_words(m.group(0)), text)
    text = _ORDINAL.sub(lambda m: m.group(1), text)  # «13-м этаже» → «13 этаже» (суффикс не озвучивается)
    text = _NUMBER.sub(lambda m: number_to_words(int(m.group(0))), text)
    return " ".join(text.split())


def split_chunks(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        candidate = f"{current} {sentence}".strip()
        if len(candidate) > limit and current:
            chunks.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def synthesize(text: str, voice: str, out_path: Path) -> Synthesis:
    """Текст → WAV 24 кГц mono int16 по `out_path`; возвращает путь, длительность и голос Silero."""
    model = _load()
    import torch
    speaker = SPEAKERS.get(voice, SPEAKERS["male"])
    pieces: list[np.ndarray] = []
    for chunk in split_chunks(prepare_text(text)):
        with torch.no_grad():
            audio = model.apply_tts(text=chunk, speaker=speaker, sample_rate=SAMPLE_RATE)
        pieces.append(audio.numpy().astype(np.float32))
        pieces.append(np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32))  # пауза между фразами
    samples = np.concatenate(pieces) if pieces else np.zeros(SAMPLE_RATE // 2, dtype=np.float32)
    write_wav(out_path, samples)
    return Synthesis(path=out_path, duration_ms=int(len(samples) * 1000 / SAMPLE_RATE), speaker=speaker)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.clip(samples, -1.0, 1.0)
    pcm = (data * 32767).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def wav_duration_ms(path: Path) -> int | None:
    try:
        with wave.open(str(path), "rb") as handle:
            return int(handle.getnframes() * 1000 / handle.getframerate())
    except (OSError, wave.Error):
        return None
