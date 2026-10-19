"""Малый платный тест реальных SpeechKit + LLM; только синтетическая речь, без файлов аудио.

Запуск из backend: .venv/Scripts/python.exe -m scripts.smoke_speechkit
Нужны SPEECHKIT_API_KEY и существующие LIVE_CALL_LLM_* в backend/.env.
"""
from __future__ import annotations

import asyncio
import base64
import json
import time

import numpy as np

from app.api.errors import ApiError
from app.config import get_settings
from app.services.realtime_speechkit import SpeechKitSession, configured


async def main():
    if not configured():
        print("SpeechKit не настроен: добавьте SPEECHKIT_API_KEY в backend/.env и установите extra speechkit.")
        return 2
    results = {"provider": "speechkit", "model": get_settings().speechkit_tts_model,
               "caller_starts_first": False, "input_transcript": "", "audio_chunks": 0,
               "audio_peak": 0, "texts": []}
    async with SpeechKitSession() as session:
        # Тестовый вопрос синтезирует облако; затем он подаётся как реальный PCM-поток.
        phrases = asyncio.Queue()
        await phrases.put("Назовите адрес происшествия.")
        await phrases.put(None)
        question = b"".join([chunk async for chunk in session.synthesize(phrases)])
        samples = np.frombuffer(question, dtype="<i2")
        resampled = np.interp(np.arange(0, len(samples), 1.5), np.arange(len(samples)), samples).astype("<i2").tobytes()
        started = time.monotonic()
        await session.send(json.dumps({"type": "session.update", "session": {"instructions": (
            "Ты заявитель в учебной службе 112. При соединении поздоровайся и расскажи о дыме. "
            "Факты: дым в подъезде; адрес Москва, улица Лесная, дом 12. Пострадавших не видно. "
            "Адрес сообщай только по вопросу оператора. Не придумывай дополнительные факты."
        )}}, ensure_ascii=False))

        async def receive_response(operator=False):
            text = ""
            async with asyncio.timeout(45):
                while True:
                    event = json.loads(await session.recv())
                    kind = event["type"]
                    if kind == "error":
                        raise ApiError(503, "internal", event["message"])
                    if kind == "conversation.item.input_audio_transcription.completed":
                        results["input_transcript"] = event["transcript"]
                    elif kind == "response.text.delta":
                        text += event["delta"]
                    elif kind == "response.audio.delta":
                        results["audio_chunks"] += 1
                        pcm = np.frombuffer(base64.b64decode(event["delta"]), dtype="<i2").astype(np.int32)
                        results["audio_peak"] = max(results["audio_peak"], int(np.abs(pcm).max(initial=0)))
                        if "first_audio_sec" not in results:
                            results["first_audio_sec"] = round(time.monotonic() - started, 2)
                    elif kind == "response.done" and event["response"]["status"] == "completed":
                        if operator and not results["input_transcript"]:
                            continue
                        results["texts"].append(text)
                        return

        await receive_response()
        results["caller_starts_first"] = True
        # Сервер отправляет звук чуть вперёд; даём первому ответу доиграть перед вопросом.
        await asyncio.sleep(0.7)

        async def send_question():
            pcm = resampled + b"\0" * 64000
            for offset in range(0, len(pcm), 3200):
                await session.send(json.dumps({"type": "input_audio_buffer.append",
                                               "audio": base64.b64encode(pcm[offset:offset + 3200]).decode()}))
                await asyncio.sleep(0.1)

        sender = asyncio.create_task(send_question())
        try:
            await receive_response(operator=True)
        finally:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)
    if not results["audio_peak"] or "адрес" not in results["input_transcript"].lower():
        raise ApiError(503, "internal", "Тест не подтвердил распознавание вопроса и непустой звук")
    if "Лесн" not in results["texts"][-1] or "12" not in results["texts"][-1]:
        raise ApiError(503, "internal", "Разговорная модель не подтвердила адрес синтетического билета")
    path = get_settings().var_dir / "speechkit-smoke.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except ApiError as exc:
        print(exc.message)
        raise SystemExit(1) from None
