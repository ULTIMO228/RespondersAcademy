"""Реальная проверка PCM/Vosk/Groq/Silero без БД и микрофона: python -m scripts.smoke_realtime_cascade."""
from __future__ import annotations

import asyncio
import base64
import json
import time

import numpy as np

from app.config import get_settings
from app.services.live_caller_provider import FACT_KEYS
from app.services.realtime_call_service import session_update
from app.services.realtime_cascade import CascadeSession
from ml.speech import tts


async def main():
    settings = get_settings()
    cards = json.loads((settings.seed_dir / "mocks/cards.json").read_text(encoding="utf-8"))["cards"]
    card = next(row for row in cards if row["id"] == "c-010")
    facts = {key: card[key] for key in FACT_KEYS if key in card}
    pcm = await asyncio.to_thread(tts.synthesize_pcm, "Служба сто двенадцать. Назовите адрес происшествия.")
    samples = np.frombuffer(pcm, dtype="<i2")
    question = np.interp(np.arange(0, len(samples), 1.5), np.arange(len(samples)), samples).astype("<i2").tobytes()
    async with CascadeSession() as session:
        created = json.loads(await session.recv())
        await session.send(json.dumps(session_update(created, facts)))
        await session.recv()
        ended_question = 0.0

        async def microphone():
            nonlocal ended_question
            for offset in range(0, len(question), 1280):
                await session.send(json.dumps({"type": "input_audio_buffer.append", "audio": base64.b64encode(question[offset:offset + 1280]).decode()}))
                await asyncio.sleep(0.04)
            ended_question = time.perf_counter()
            while True:
                await session.send(json.dumps({"type": "input_audio_buffer.append", "audio": base64.b64encode(b"\0" * 1280).decode()}))
                await asyncio.sleep(0.04)

        feed = asyncio.create_task(microphone())
        result = {"recognized": "", "reply": "", "audio_bytes": 0, "audio_chunks": 0, "first_audio_after_question_sec": None}
        try:
            async with asyncio.timeout(45):
                while True:
                    event = json.loads(await session.recv())
                    kind = event["type"]
                    if kind == "conversation.item.input_audio_transcription.completed":
                        result["recognized"] = event["transcript"]
                    elif kind == "response.text.delta":
                        result["reply"] += event["delta"]
                    elif kind == "response.audio.delta":
                        result["audio_bytes"] += len(base64.b64decode(event["delta"]))
                        result["audio_chunks"] += 1
                        if result["first_audio_after_question_sec"] is None:
                            result["first_audio_after_question_sec"] = round(time.perf_counter() - ended_question, 2)
                    elif kind == "response.done":
                        break
                    elif kind == "error":
                        raise RuntimeError(event["message"])
        finally:
            feed.cancel()
            await asyncio.gather(feed, return_exceptions=True)
        assert result["recognized"] and result["audio_bytes"] > 0, result
        output = settings.var_dir / "realtime-cascade-smoke.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
