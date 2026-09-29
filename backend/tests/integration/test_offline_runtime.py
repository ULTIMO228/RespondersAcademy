"""Offline acceptance smoke: the backend path must not open network connections."""

from __future__ import annotations

import json
import socket

import pytest

from app.config import get_settings
from ml.generate import scenario_generator


@pytest.mark.asyncio
async def test_reference_classifier_and_template_generation_without_network(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ollama_url", None)
    attempts: list[object] = []

    def deny_connect(_socket, address):
        attempts.append(address)
        raise AssertionError(f"Сетевое соединение в офлайн-режиме: {address}")

    monkeypatch.setattr(socket.socket, "connect", deny_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", deny_connect)

    reference = await client.get("/reference")
    assert reference.status_code == 200
    classifier = await client.get("/classifier", params={"group": "пожар в жилом доме"})
    assert classifier.status_code == 200
    rejected = await client.post("/cards/card-881412/status", json={"ddsStatus": "notAccepted"})
    assert rejected.status_code == 400

    root = settings.seed_dir
    cards = json.loads((root / "spec/000-фронт/mocks/cards.json").read_text(encoding="utf-8"))["cards"]
    addresses = json.loads((root / "mocks/local/addresses.json").read_text(encoding="utf-8"))["addresses"]
    generated = scenario_generator.generate("пожар в жилом доме", cards, addresses)
    assert len(generated) == 3
    assert all(item["scenario"]["generation"]["provider"] == "template" for item in generated)
    assert attempts == []
