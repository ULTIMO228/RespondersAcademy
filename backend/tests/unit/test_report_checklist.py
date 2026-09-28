"""Twenty labeled Russian DDS reports and the uploaded-audio API path."""

from __future__ import annotations

import io
import json
import wave
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_sessionmaker
from app.models.session import Attempt, TrainingSession
from app.services.time import now_iso
from ml.insights.call_responder import CHECK_IDS, check_report
from ml.speech import stt
from tests.conftest import login_as

DATA = Path(__file__).resolve().parents[2] / "data" / "labeled" / "reports" / "phase16.json"


def test_twenty_labeled_reports_reach_eighty_percent_checklist_accuracy():
    sample = json.loads(DATA.read_text(encoding="utf-8"))
    assert len(sample["reports"]) == 20
    matched = total = 0
    for item in sample["reports"]:
        report = check_report([{"speaker": "dispatcher", "text": item["text"]}], sample["card"])
        assert report is not None and {check.id for check in report.checks} == set(CHECK_IDS)
        expected = set(item["expectedPresent"])
        matched += sum(check.found == (check.id in expected) for check in report.checks)
        total += len(report.checks)
    assert matched / total >= 0.8


def test_stt_rejects_invalid_wav_and_reports_missing_local_model(monkeypatch, tmp_path):
    with pytest.raises(ValueError):
        stt.transcribe(b"invalid")
    sound = io.BytesIO()
    with wave.open(sound, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(16000)
        stream.writeframes(b"\0\0" * 160)
    monkeypatch.setattr(stt, "model_path", lambda: tmp_path / "missing-vosk")
    stt._model.cache_clear()
    with pytest.raises(stt.SpeechUnavailable):
        stt.transcribe(sound.getvalue())


async def test_audio_report_is_transcribed_scored_and_listed(app, monkeypatch, tmp_path):
    sample = json.loads(DATA.read_text(encoding="utf-8"))
    transcript = sample["reports"][0]["text"]
    monkeypatch.setattr(stt, "transcribe", lambda _: transcript)
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "var_dir", tmp_path)
    async with get_sessionmaker()() as db:
        session = TrainingSession(id="ses-991", teacher_id="u-002", student_ids=["u-005"], scenario_ids=[],
                                  mode="practice", card_source="generated", card_flow=[], state="running",
                                  started_at=now_iso(), plan=None, parked=[], training_mode="dds", format="training")
        attempt = Attempt(id="att-991", session_id=session.id, card_id="c-010", student_id="u-005", mode="dds",
                          opened_at=now_iso(), primary_reaction_ms=0, statuses=[], services_called=[],
                          full_processing_ms=0, entered_text={}, calls=[], seq=0)
        db.add_all([session, attempt])
        await db.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
            await login_as(client, "student")
            posted = await client.post("/attempts/att-991/report-audio", files={"file": ("report.wav", b"RIFFtest", "audio/wav")})
            assert posted.status_code == 201, posted.text
            call = posted.json()["call"]
            assert call["transcript"][0]["text"] == transcript
            assert len(call["report"]["checks"]) == 5
            listed = await client.get("/cards/c-010/recordings")
            recording = next(item for item in listed.json() if item["id"] == call["id"])
            audio = await client.get("http://test" + recording["url"])
            assert audio.status_code == 200 and audio.content == b"RIFFtest"
            await login_as(client, "student2")
            assert (await client.get("/cards/c-010/recordings")).json() == []
            assert (await client.get("http://test" + recording["url"])).status_code == 403
    finally:
        async with get_sessionmaker()() as db:
            await db.delete(await db.get(Attempt, "att-991"))
            await db.delete(await db.get(TrainingSession, "ses-991"))
            await db.commit()
