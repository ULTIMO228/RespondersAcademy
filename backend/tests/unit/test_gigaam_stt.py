import numpy as np
import pytest

from ml.speech import gigaam_stt

torch = pytest.importorskip("torch")


class FakeModel:
    """Повторяет интерфейс GigaAMASR, через который идёт transcribe() пакета (без ffmpeg и файлов)."""

    def __init__(self):
        self._device = torch.device("cpu")
        self._dtype = torch.float32
        self.seen = None

    def forward(self, wav, length):
        self.seen = (wav, length)
        return "encoded", "encoded_len"

    def _decode(self, encoded, encoded_len, length, word_timestamps):
        assert (encoded, encoded_len, word_timestamps) == ("encoded", "encoded_len", False)
        return [(" Назовите адрес. ", None)]


def test_pcm_goes_to_model_without_files_and_text_is_returned(monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(gigaam_stt, "load", lambda name: model)
    pcm = (np.array([16384, -16384, 0], dtype="<i2")).tobytes()
    assert gigaam_stt.transcribe(pcm, "v3_e2e_rnnt") == "Назовите адрес."
    wav, length = model.seen
    assert wav.shape == (1, 3) and length.tolist() == [3]
    assert wav[0].tolist() == pytest.approx([0.5, -0.5, 0.0])  # PCM16 → [-1, 1], как load_audio() пакета


def test_weights_path_is_under_models_dir():
    from app.config import get_settings

    assert gigaam_stt.weights_path("v3_e2e_rnnt") == get_settings().models_dir / "gigaam" / "v3_e2e_rnnt.ckpt"
