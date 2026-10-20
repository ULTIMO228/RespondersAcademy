"""Спека 017: схемы рейтинга обучающихся ⊇ TS-типы `src/shared/api/types/student-rating.ts` (как `test_error_map_shapes.py`)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.schemas import student_rating as schemas

EXPECTED = json.loads((Path(__file__).parent / "expected_fields.json").read_text(encoding="utf-8"))["types"]

MODELS: dict[str, type[BaseModel]] = {
    "RatingNorms": schemas.RatingNorms,
    "RatingGroup": schemas.RatingGroup,
    "StudentStatsSummary": schemas.StudentStatsSummary,
    "StudentRatingRow": schemas.StudentRatingRow,
    "StudentRatingResponse": schemas.StudentRatingResponse,
    "StudentStatsPoint": schemas.StudentStatsPoint,
    "StudentStatsAttempt": schemas.StudentStatsAttempt,
    "StudentStatsByMode": schemas.StudentStatsByMode,
    "StudentStats": schemas.StudentStats,
}


@pytest.mark.parametrize("ts_name", sorted(MODELS))
def test_schema_fields_match_typescript_contract(ts_name: str):
    model = MODELS[ts_name]
    required = {field.alias or name for name, field in model.model_fields.items() if field.is_required()}
    optional = {field.alias or name for name, field in model.model_fields.items() if not field.is_required()}
    assert required == set(EXPECTED[ts_name]["required"]), f"{ts_name}: обязательные поля расходятся с TS"
    assert optional == set(EXPECTED[ts_name]["optional"]), f"{ts_name}: опциональные поля расходятся с TS"
