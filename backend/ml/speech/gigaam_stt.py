"""Локальное распознавание речи живого заявителя: GigaAM-v3 (MIT, salute-developers/GigaAM) на CPU.

Пакет — `uv sync --extra stt-local` (закреплён коммит). Веса (`v3_e2e_rnnt`, `v3_e2e_ctc` …) пакет скачивает
с CDN Сбера при первой загрузке в `MODELS_DIR/gigaam` — единственный шаг с сетью
(`uv run python -m scripts.gigaam_check`). Вход — PCM16 моно 16 кГц, как у Silero VAD; одна реплика ≤ 25 с.
"""
from __future__ import annotations

import importlib.util
import threading
from pathlib import Path

import numpy as np

SUBDIR = "gigaam"
_lock = threading.Lock()
_infer = threading.Lock()
_models: dict = {}


def available() -> bool:
    return bool(importlib.util.find_spec("gigaam") and importlib.util.find_spec("torchaudio"))


def model_dir() -> Path:
    from app.config import get_settings

    return get_settings().models_dir / SUBDIR


def weights_path(name: str) -> Path:
    return model_dir() / f"{name}.ckpt"


def load(name: str):
    with _lock:
        if name not in _models:
            import gigaam

            _models[name] = gigaam.load_model(name, device="cpu", download_root=str(model_dir()))
        return _models[name]


def transcribe(pcm: bytes, name: str) -> str:
    """То же, что GigaAMASR.transcribe(), но из памяти: без временного WAV и ffmpeg (минус десятки мс)."""
    import torch

    model = load(name)
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    with _infer, torch.inference_mode():
        wav = torch.from_numpy(samples).to(model._device).to(model._dtype).unsqueeze(0)
        length = torch.full([1], wav.shape[-1], device=model._device)
        encoded, encoded_len = model.forward(wav, length)
        text, _words = model._decode(encoded, encoded_len, length, False)[0]
    return str(text).strip()
