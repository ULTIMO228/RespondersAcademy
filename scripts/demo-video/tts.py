"""Синтез реплик Silero (офлайн). Каждое предложение синтезируется отдельно, между ними вставляется пауза.

python tts.py <модель.pt> <голос> <скорость> <пауза_с> <каталог> < replicas.json   (JSON-список строк → s00.wav, s01.wav…)
  скорость — множитель темпа (1.0 = как есть, 0.9 = медленнее, 1.1 = быстрее; тональность не меняется, ffmpeg atempo из FFMPEG);
  пауза_с  — тишина между предложениями, секунды (например 0.5).
"""
import json
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import torch

model_path, speaker, speed, pause, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), Path(sys.argv[5])
out.mkdir(parents=True, exist_ok=True)
model = torch.package.PackageImporter(model_path).load_pickle("tts_models", "model")
model.to("cpu")
SR = 48000
silence = np.zeros(int(SR * pause), dtype=np.int16)


def sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?…])\s+", text) if part.strip()]


def write_wav(path: Path, pcm: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


for i, text in enumerate(json.load(sys.stdin)):
    chunks: list[np.ndarray] = []
    for sentence in sentences(text):
        audio = model.apply_tts(text=sentence, speaker=speaker, sample_rate=SR, put_accent=True, put_yo=True)
        chunks += [(audio.clamp(-1, 1) * 32767).short().numpy(), silence]
    pcm = np.concatenate(chunks[:-1])
    target = out / f"s{i:02d}.wav"
    if abs(speed - 1.0) < 0.01:
        write_wav(target, pcm)
    else:
        raw = out / f"raw{i:02d}.wav"
        write_wav(raw, pcm)
        subprocess.run([os.environ.get("FFMPEG", "ffmpeg"), "-y", "-loglevel", "error", "-i", str(raw), "-filter:a", f"atempo={speed}", str(target)], check=True)
        raw.unlink()
    print(f"s{i:02d} {len(pcm) / SR / speed:.1f}s")
