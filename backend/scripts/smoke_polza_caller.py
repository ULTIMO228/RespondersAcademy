"""Проверка живого заявителя через Polza.ai с настоящим ключом (платные запросы!).

Из backend/:  uv run python -m scripts.smoke_polza_caller [--models]
  --models  только показать ID моделей каталога (chat / stt / tts), без генерации.

Без флага: одна реплика заявителя по синтетическому билету (LLM с метками эмоций),
её озвучка (TTS с инструкцией эмоции) и обратное распознавание (STT). Звук и
отчёт — в var/polza-smoke/. Ключ не печатается.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

import httpx

from app.config import get_settings
from app.services import caller_persona as persona
from app.services import realtime_call_service as call
from app.services.realtime_cascade import stream_reply
from app.services.realtime_polza import PolzaSession

FACTS = {"summary": "Горит балкон на 13 этаже жилого дома, видно открытое пламя",
         "address": "Москва, улица Грина, дом 11",
         "caller": {"name": "Сидорова Анна Викторовна", "phone": "916-126-34-71", "status": "соседка"}}


async def list_models(client: httpx.AsyncClient, base: str, headers: dict[str, str]) -> None:
    response = await client.get(base + "/models", headers=headers)
    response.raise_for_status()
    items = response.json().get("data", [])
    for item in items:
        kind = item.get("type") or item.get("architecture", {}).get("modality", "")
        model_id = item.get("id", "")
        if any(word in model_id.lower() for word in ("qwen", "asr", "tts", "whisper", "voxtral", "gigachat", "deepseek")):
            print(f"{kind!s:>12}  {model_id}")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    if not settings.polza_api_key:
        print("Нет POLZA_API_KEY в backend/.env", file=sys.stderr)
        return 2
    session = PolzaSession()
    session.client = httpx.AsyncClient(timeout=httpx.Timeout(settings.polza_timeout_sec, connect=10))
    try:
        if args.models:
            await list_models(session.client, session._base(), session._headers())
            return 0
        missing = [name for name in ("live_call_polza_chat_model", "live_call_polza_stt_model", "live_call_polza_tts_model")
                   if not getattr(settings, name)]
        if missing:
            print("Задайте в backend/.env: " + ", ".join(name.upper() for name in missing), file=sys.stderr)
            return 2
        out = settings.var_dir / "polza-smoke"
        out.mkdir(parents=True, exist_ok=True)
        created = {"session": {"capabilities": {"turn_detection": ["server_vad"]}}}
        system = call.session_update(created, FACTS, persona.STYLE)["session"]["instructions"] + "\n" + session.reply_rules()
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": "Соединение установлено. Начни звонок как заявитель."}]
        report: dict[str, object] = {}

        started = time.monotonic()
        first = None
        raw = ""
        async for delta in stream_reply(messages, session.client, session.llm_endpoint()):
            first = first or time.monotonic() - started
            raw += delta
        report["llm"] = {"firstTokenSec": round(first or 0, 2), "totalSec": round(time.monotonic() - started, 2),
                         "raw": raw, "shown": persona.strip_tags(raw)}

        started = time.monotonic()
        phrases: asyncio.Queue = asyncio.Queue()
        for item in (raw, None):
            await phrases.put(item)
        audio = b"".join([chunk async for chunk in session.synthesize(phrases)])
        report["tts"] = {"sec": round(time.monotonic() - started, 2), "mood": session.mood,
                         "audioSec": round(len(audio) / 48000, 2)}
        (out / "caller.wav").write_bytes(persona.pcm16_to_wav(audio, 24000))

        # Обратная проверка STT: 24 кГц → 16 кГц, как с микрофона.
        import numpy as np
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32)
        pcm16k = np.interp(np.linspace(0, len(samples) - 1, len(samples) * 2 // 3), np.arange(len(samples)), samples)
        started = time.monotonic()
        text = await session.transcribe(pcm16k.astype("<i2").tobytes())
        report["stt"] = {"sec": round(time.monotonic() - started, 2), "text": text}
        (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print(f"Звук: {out / 'caller.wav'}")
        return 0
    finally:
        await session.client.aclose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
