"""Локальный smoke без БД и браузера: Silero-вопрос → Vosk → LLM → Silero-ответ.

Из backend: python -m scripts.smoke_live_caller. LLM должна быть запущена;
LIVE_CALL_LLM_URL и JWT_SECRET читаются стандартными настройками. Гарнитуру не проверяет.
"""
from __future__ import annotations

import argparse
import io
import json
import time
import wave

import numpy as np

from app.config import get_settings
from app.services.live_caller_provider import FACT_KEYS, LocalCallerProvider


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", default="Назовите адрес происшествия.")
    args = parser.parse_args()
    settings = get_settings()
    provider = LocalCallerProvider()
    provider.ready()
    output = settings.var_dir / "live-caller-smoke"
    output.mkdir(parents=True, exist_ok=True)
    question = args.question
    provider.synthesize(question, output / "question.wav")
    # Silero выдаёт 24 кГц; Vosk и браузерный recorder используют 16 кГц.
    with wave.open(str(output / "question.wav"), "rb") as source:
        rate = source.getframerate()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
    reduced = np.interp(np.arange(0, len(samples), rate / 16000), np.arange(len(samples)), samples).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(16000)
        target.writeframes(reduced.tobytes())
    tick = time.perf_counter()
    text = provider.transcribe(buffer.getvalue())
    stt_sec = time.perf_counter() - tick
    if not text:
        raise RuntimeError("Vosk не распознал синтетический вопрос")
    cards = json.loads((settings.seed_dir / "mocks/cards.json").read_text(encoding="utf-8"))["cards"]
    card = next(row for row in cards if row["id"] == "c-010")
    facts = {key: card[key] for key in FACT_KEYS if key in card}
    tick = time.perf_counter()
    reply = provider.reply(facts, [{"speaker": "dispatcher", "text": text}])
    llm_sec = time.perf_counter() - tick
    tick = time.perf_counter()
    provider.synthesize(reply, output / "reply.wav")
    result = {"question": question, "recognized": text, "reply": reply, "expectedAddress": facts.get("address"),
              "seconds": {"stt": round(stt_sec, 2), "llm": round(llm_sec, 2), "tts": round(time.perf_counter() - tick, 2)},
              "audio": str(output / "reply.wav")}
    (output / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
