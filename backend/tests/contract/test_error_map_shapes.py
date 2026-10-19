"""Спека 003, T009: схемы карты ошибок ⊇ TS-типы `src/shared/api/types/error-map.ts` (та же сверка, что в `test_v1_shapes.py`).

Сверка идёт по `expected_fields.json` (см. `scripts/extract_ts_fields.py`): обязательные поля TS (без `?`) — это поля Pydantic
без значения по умолчанию (включая обязательные nullable `… | null`); опциональные (`?:`) — поля со значением None по умолчанию.
Имена — camelCase-алиасы, как на проводе.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.schemas import error_map as schemas

EXPECTED = json.loads((Path(__file__).parent / "expected_fields.json").read_text(encoding="utf-8"))["types"]

MODELS: dict[str, type[BaseModel]] = {
    "ErrorMapStage": schemas.ErrorMapStage,
    "ErrorMapStageLevel": schemas.ErrorMapStageLevel,
    "ErrorMapScope": schemas.ErrorMapScope,
    "ErrorMapHeadline": schemas.ErrorMapHeadline,
    "ErrorMapResponse": schemas.ErrorMapResponse,
    "ErrorMapStudentRef": schemas.ErrorMapStudentRef,
    "ErrorMapTypicalError": schemas.ErrorMapTypicalError,
    "ErrorMapChainLink": schemas.ErrorMapChainLink,
    "ErrorMapExplanation": schemas.ErrorMapExplanation,
    "ErrorMapStageDetail": schemas.ErrorMapStageDetail,
    "ErrorMapJournalRow": schemas.ErrorMapJournalRow,
    "ErrorMapJournalResponse": schemas.ErrorMapJournalResponse,
    "ErrorMapVerdictRequest": schemas.ErrorMapVerdictRequest,
    "MyFocusItem": schemas.MyFocusItem,
    "MyFocusResponse": schemas.MyFocusResponse,
    "ErrorMapSettings": schemas.ErrorMapSettings,
}


@pytest.mark.parametrize("ts_name", sorted(MODELS))
def test_schema_fields_match_typescript_contract(ts_name: str):
    model = MODELS[ts_name]
    required = {field.alias or name for name, field in model.model_fields.items() if field.is_required()}
    optional = {field.alias or name for name, field in model.model_fields.items() if not field.is_required()}

    assert required == set(EXPECTED[ts_name]["required"]), f"{ts_name}: обязательные поля расходятся с TS"
    assert optional == set(EXPECTED[ts_name]["optional"]), f"{ts_name}: опциональные поля расходятся с TS"
