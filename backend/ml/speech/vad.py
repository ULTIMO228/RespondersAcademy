"""Локальный Silero VAD: отдельное состояние модели на каждый разговор."""
from app.config import get_settings

MODEL_SHA256 = "e1122837f4154c511485fe0b9c64455f7b929c96fbb8d79fbdb336383ebd3720"
MODEL_REVISION = "1e261b036686cd0017d500ee96acd1c4ba572a9d"


def model_path():
    return get_settings().models_dir / "silero-vad" / "silero_vad.jit"


class SpeechDetector:
    def __init__(self):
        import hashlib

        import torch

        path = model_path()
        if hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError("Неверная контрольная сумма Silero VAD")
        self.model = torch.jit.load(str(path), map_location="cpu").eval()
        self.pending = b""
        self.probability = 0.0

    def push(self, pcm: bytes) -> float:
        import numpy as np
        import torch

        self.pending += pcm
        probabilities = []
        while len(self.pending) >= 1024:
            frame, self.pending = self.pending[:1024], self.pending[1024:]
            samples = np.frombuffer(frame, dtype="<i2").astype(np.float32) / 32768
            with torch.inference_mode():
                self.probability = float(self.model(torch.from_numpy(samples), 16000).item())
            probabilities.append(self.probability)
        return max(probabilities, default=self.probability)
