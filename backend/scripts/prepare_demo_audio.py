"""Prepare a local 16 kHz WAV DDS report for the Demo Day upload flow."""

from __future__ import annotations

import os
import secrets
import wave
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))

from ml.speech import tts  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
OUTPUT = BACKEND_DIR / "var" / "demo-dds-report.wav"
TEMPORARY = BACKEND_DIR / "var" / "demo-dds-report-24k.wav"
REPORT = (
    "Карточка номер десять. Москва, улица Грина, дом одиннадцать. "
    "Пожар в жилом доме: горит балкон и два окна на тринадцатом этаже, открытое пламя. "
    "Дом газифицирован. Пострадавших нет. Карточка принята, направлены пожарный расчёт, полиция и Мосгаз."
)


def main() -> None:
    try:
        tts.synthesize(REPORT, "male", TEMPORARY)
        with wave.open(str(TEMPORARY), "rb") as source:
            assert source.getnchannels() == 1 and source.getsampwidth() == 2 and source.getframerate() == 24000
            samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
        pcm = resample_poly(samples, 2, 3).clip(-32768, 32767).astype("<i2")
        with wave.open(str(OUTPUT), "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(16000)
            target.writeframes(pcm.tobytes())
    finally:
        TEMPORARY.unlink(missing_ok=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
