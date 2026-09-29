"""Опубликованные демо-MP3 доступны установщику после клонирования репозитория."""

from scripts.install_demo_recordings import BACKEND_DIR, RECORDINGS, mp3_duration_ms


def test_bundled_demo_recordings_are_valid_mp3() -> None:
    assert set(RECORDINGS) == {"c-010", "c-049", "c-050"}
    audio_dir = BACKEND_DIR / "data" / "demo_audio"
    for card_id in RECORDINGS:
        path = audio_dir / f"{card_id}-elevenlabs.mp3"
        assert path.is_file()
        assert path.stat().st_size > 100_000
        assert 20_000 <= mp3_duration_ms(path) <= 35_000
