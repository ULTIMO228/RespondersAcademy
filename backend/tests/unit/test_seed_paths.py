"""Регрессия: сиды читаются после переноса spec/mocks в spec/000-фронт/mocks."""

from pathlib import Path

import pytest

from app.config import get_settings
from app.seed.load import SeedPaths, read_json
from ml.generate.scenario_generator import load_reference


def test_читает_канонические_сиды_после_переноса() -> None:
    # Arrange
    paths = SeedPaths(get_settings().seed_dir)

    # Act
    cards = read_json(paths.spec("cards.json"))
    reference = read_json(paths.spec("reference.json"))

    # Assert
    assert paths.spec("cards.json").parent == get_settings().seed_dir / "spec" / "000-фронт" / "mocks"
    assert cards["cards"]
    assert reference["incidentGroups"]
    assert load_reference(get_settings().seed_dir)["incidentGroups"] == reference["incidentGroups"]
    assert (paths.local / "addresses.json").is_file()
    assert (paths.admin / "system-settings.json").is_file()


def test_отсутствующий_корень_сидов_даёт_явную_ошибку(tmp_path: Path) -> None:
    # Arrange
    missing = SeedPaths(tmp_path)

    # Act, assert
    with pytest.raises(FileNotFoundError, match="cards.json"):
        read_json(missing.spec("cards.json"))
    with pytest.raises(FileNotFoundError, match="reference.json"):
        load_reference(tmp_path)
