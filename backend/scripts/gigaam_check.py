"""Замер локального распознавания GigaAM-v3 на этой машине; при настроенном Polza — те же фразы через API.

Из backend/:
  uv sync --group dev --extra tts --extra stt-local
  uv run python -m scripts.gigaam_check [--model v3_e2e_rnnt] [--wav запись.wav ...]

Первый запуск скачивает веса модели с CDN Сбера в models/gigaam (нужна сеть). Фразы оператора озвучивает
локальный Silero (синтетическая речь распознаётся легче живой — для честной цифры передайте свои записи
через --wav). Результат — var/gigaam-check.json. Ключи не печатаются.
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import platform
import statistics
import sys
import time
import wave

import httpx
import numpy as np

from app.config import get_settings
from ml.speech import gigaam_stt

PHRASES = [
    "Служба сто двенадцать, оператор слушает. Что у вас случилось?",
    "Назовите адрес: улица, номер дома, подъезд.",
    "Как вас зовут и по какому номеру с вами связаться?",
    "Оставайтесь на линии, пожарные уже выехали.",
]


def resample(pcm: bytes, source: int, target: int = 16000) -> bytes:
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
    if source == target or not len(samples):
        return pcm
    count = max(1, round(len(samples) * target / source))
    resampled = np.interp(np.linspace(0, len(samples) - 1, count), np.arange(len(samples)), samples)
    return np.clip(resampled, -32768, 32767).astype("<i2").tobytes()


def read_wav(path: str) -> bytes:
    with wave.open(path) as source:
        if source.getsampwidth() != 2:
            raise SystemExit(f"{path}: нужен 16-битный WAV")
        channels, rate = source.getnchannels(), source.getframerate()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1).astype("<i2")
    return resample(samples.tobytes(), rate)


def synthesized() -> list[tuple[str, bytes]]:
    from ml.speech import tts

    settings = get_settings()
    live = settings.live_call_silero_model
    if live and settings.live_call_silero_speaker and tts.live_model_path(live).exists():
        voice = lambda text: tts.synthesize_live(text, live, settings.live_call_silero_speaker)  # noqa: E731
    elif tts.available():
        voice = tts.synthesize_pcm
    else:
        raise SystemExit("Нет локального голоса для тестовых фраз: prepare_models --only tts-live, или передайте --wav")
    return [(text, resample(voice(text), tts.SAMPLE_RATE)) for text in PHRASES]


async def polza_ms(pcm: bytes) -> tuple[float, str] | None:
    settings = get_settings()
    key = settings.polza_api_key
    if not (key and key.get_secret_value().strip() and settings.live_call_polza_stt_model):
        return None
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(16000)
        target.writeframes(pcm)
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            settings.polza_base_url.rstrip("/") + "/audio/transcriptions",
            headers={"Authorization": "Bearer " + key.get_secret_value().strip()},
            files={"file": ("speech.wav", buffer.getvalue(), "audio/wav")},
            data={"model": settings.live_call_polza_stt_model, "language": "ru", "response_format": "json"})
    if not response.is_success:
        return (time.monotonic() - started) * 1000, f"ошибка {response.status_code}"
    return (time.monotonic() - started) * 1000, str(response.json().get("text", "")).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", help="версия GigaAM (по умолчанию LIVE_CALL_GIGAAM_MODEL или v3_e2e_rnnt)")
    parser.add_argument("--wav", nargs="+", help="свои записи речи оператора вместо синтезированных фраз")
    args = parser.parse_args()
    settings = get_settings()
    name = args.model or settings.live_call_gigaam_model or "v3_e2e_rnnt"
    if not gigaam_stt.available():
        print("Нет пакета gigaam: uv sync --group dev --extra tts --extra stt-local", file=sys.stderr)
        return 2
    import torch

    print(f"Машина: {platform.platform()}, {platform.processor() or platform.machine()}, "
          f"ядер {os.cpu_count()}, потоков torch {torch.get_num_threads()}")
    started = time.monotonic()
    try:
        gigaam_stt.load(name)  # первый раз — скачивание весов
    except Exception as exc:
        print(f"Не удалось загрузить GigaAM {name}: {exc}\n"
              "Веса качаются с cdn.chatwm.opensmodel.sberdevices.ru — проверьте сеть и имя модели.", file=sys.stderr)
        return 1
    print(f"GigaAM {name}: загрузка {time.monotonic() - started:.1f} с ({gigaam_stt.weights_path(name)})")
    gigaam_stt.transcribe(b"\0\0" * 8000, name)  # прогрев, как перед звонком

    samples = [(path, read_wav(path)) for path in args.wav] if args.wav else synthesized()
    results = []
    for label, pcm in samples:
        tick = time.monotonic()
        text = gigaam_stt.transcribe(pcm, name)
        row = {"phrase": label, "speech_sec": round(len(pcm) / 32000, 2),
               "local_ms": round((time.monotonic() - tick) * 1000), "local_text": text}
        remote = asyncio.run(polza_ms(pcm))
        if remote:
            row["polza_ms"], row["polza_text"] = round(remote[0]), remote[1]
        results.append(row)
        print(f"\n{row['speech_sec']:.1f} с речи | «{label}»" if not args.wav else f"\n{row['speech_sec']:.1f} с | {label}")
        print(f"  локально {row['local_ms']:5d} мс: {text}")
        if remote:
            print(f"  Polza    {row['polza_ms']:5d} мс: {row['polza_text']}")
    print(f"\nМедиана локально: {statistics.median(r['local_ms'] for r in results):.0f} мс", end="")
    if all("polza_ms" in r for r in results):
        print(f"; Polza: {statistics.median(r['polza_ms'] for r in results):.0f} мс", end="")
    print()
    path = settings.var_dir / "gigaam-check.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"model": name, "cpu_count": os.cpu_count(), "platform": platform.platform(),
                                "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Сохранено: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
