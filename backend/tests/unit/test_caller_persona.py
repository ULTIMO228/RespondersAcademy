import io
import wave

import numpy as np

from app.services import caller_persona as persona


def test_tags_are_hidden_from_operator_even_when_split_across_tokens():
    shown = persona.TagFilter()
    tokens = ["[трев", "ожно] Алло! Ой ", "[взд", "ох] горит, горит!", " [тяжело дышит]"]
    text = "".join(shown.feed(token) for token in tokens) + shown.flush()
    assert text == "Алло! Ой горит, горит!"
    assert "[" not in text


def test_unfinished_bracket_is_not_swallowed_forever():
    shown = persona.TagFilter()
    assert shown.feed("Квартира [") == "Квартира"
    assert shown.flush() == " ["  # не метка — оператор видит как есть


def test_strip_tags_for_transcript():
    assert persona.strip_tags("[паника] Помогите! [всхлип] Он не дышит") == "Помогите! Он не дышит"


def test_mood_tag_switches_emotion_and_sounds_become_speakable_without_library():
    parts, mood = persona.segments("[паника] Ой [вздох] горит! [пауза] Быстрее!", None, "тревожно")
    assert mood == "паника"
    assert [(p.kind, p.text, p.ms) for p in parts] == [
        ("speech", "Ой Ох… горит!", 0), ("silence", "", 500), ("speech", "Быстрее!", 0)]


def test_unknown_tags_are_not_spoken():
    parts, mood = persona.segments("[смеётся] Да, слышу.", None, "спокойно")
    assert mood == "спокойно" and [p.text for p in parts] == ["Да, слышу."]


def _wav(rate: int, channels: int, samples: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(samples.astype("<i2").tobytes())
    return buffer.getvalue()


def test_sound_library_clip_is_used_when_present(tmp_path):
    (tmp_path / "sigh").mkdir()
    clip = tmp_path / "sigh" / "sigh-01.wav"
    clip.write_bytes(_wav(24000, 1, np.zeros(2400)))
    parts, _ = persona.segments("Ну [вздох] не знаю.", tmp_path, "тревожно")
    assert [(p.kind, p.path) for p in parts] == [("speech", None), ("sound", clip), ("speech", None)]


def test_wav_is_resampled_to_mono_24khz():
    stereo_16k = np.repeat(np.arange(1600, dtype=np.int16)[:, None], 2, axis=1).reshape(-1)
    pcm = persona.wav_to_pcm24(_wav(16000, 2, stereo_16k))
    assert len(pcm) == 2400 * 2  # 0,1 с при 24 кГц, 16 бит


def test_dispatcher_pcm_is_wrapped_into_wav_for_stt():
    data = persona.pcm16_to_wav(b"\x01\x00" * 160)
    with wave.open(io.BytesIO(data)) as source:
        assert (source.getframerate(), source.getnchannels(), source.getnframes()) == (16000, 1, 160)


def test_streaming_wav_with_unknown_size_is_read_to_the_end():
    # Polza отдаёт WAV из потока: в заголовках RIFF и data размер 0xFFFFFFFF.
    import struct
    pcm = np.arange(240, dtype="<i2").tobytes()
    header = (b"RIFF" + struct.pack("<I", 0xFFFFFFFF) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 24000, 48000, 2, 16)
              + b"data" + struct.pack("<I", 0xFFFFFFFF))
    assert persona.wav_to_pcm24(header + pcm) == pcm
