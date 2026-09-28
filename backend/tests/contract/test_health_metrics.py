"""Operational endpoints for ML availability and metrics."""

from __future__ import annotations

import json

import pytest

from app.config import get_settings


@pytest.mark.asyncio
async def test_health_reports_model_installation_and_load_state(client):
    response = await client.get("http://test/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["models"]) == {"embedder", "dedup", "symspell", "tts", "stt"}
    assert all(set(entry) == {"installed", "loaded"} for entry in body["models"].values())


@pytest.mark.asyncio
async def test_metrics_returns_file_contents_and_404_when_missing(client, tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "var_dir", tmp_path)
    missing = await client.get("http://test/api/v1/metrics/ml")
    assert missing.status_code == 404
    metrics = {"classifier": {"accuracy": 0.9}}
    (tmp_path / "metrics.json").write_text(json.dumps(metrics), encoding="utf-8")
    response = await client.get("http://test/api/v1/metrics/ml")
    assert response.status_code == 200
    assert response.json() == metrics
