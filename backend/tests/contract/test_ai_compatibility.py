"""Контрактные проверки новых ресурсов AI workflow и прежнего Evaluation."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from httpx import AsyncClient
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

from app.schemas.v1.ai import (
    AttemptEvent,
    EvaluationRevision,
    ScenarioVersion,
    SemanticDecision,
    SessionReport,
)
from tests.conftest import login_as

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACTS_DIR = REPO_ROOT / "spec" / "001-ai" / "contracts"
LEGACY_EVALUATION_SCHEMA = (
    REPO_ROOT / "specs" / "002-two-mode-simulator" / "contracts" / "evaluation.schema.json"
)
DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema"

AI_SCHEMA_PATHS = {
    "scenario": CONTRACTS_DIR / "scenario.schema.json",
    "event": CONTRACTS_DIR / "event.schema.json",
    "evaluation": CONTRACTS_DIR / "evaluation-state.schema.json",
    "report": CONTRACTS_DIR / "report.schema.json",
}

SCENARIO: dict[str, object] = {
    "schemaVersion": "ai-workflow/1",
    "scenarioId": "scenario-test-1",
    "version": 1,
    "mode": "operator112",
    "sourceTicketId": "ticket-test-1",
    "sourceSituationNo": 1,
    "sourceKind": "ticket",
    "sourceHash": "a" * 64,
    "etalonVersion": "etalon-test-1",
    "approval": "approved",
    "validation": "passed",
    "cardSnapshot": {"id": "card-test-1", "fields": {}},
    "ruleSourceIds": ["memo-test-1"],
    "approvedBy": "teacher-test-1",
}

EVENT: dict[str, object] = {
    "schemaVersion": "ai-workflow/1",
    "id": "event-test-1",
    "attemptId": "attempt-test-1",
    "seq": 0,
    "mode": "dds",
    "kind": "field_updated",
    "occurredAt": "2026-09-23T12:00:00Z",
    "payload": {"field": "address"},
    "cardVersion": 1,
    "sourceScenarioVersion": 1,
}

ERROR_RECORD: dict[str, object] = {
    "id": "error-test-1",
    "attemptId": "attempt-test-1",
    "mode": "operator112",
    "ruleId": "wrongAddress",
    "type": "addressMismatch",
    "severity": "major",
    "evidenceKey": "address:card-test-1",
    "observed": "Лесная улица, 2",
    "expected": "Лесная улица, 12",
    "sourceRef": "etalon:address",
    "detector": "rule",
    "etalonVersion": "etalon-test-1",
    "assessorVersion": "assessor-test-1",
    "fixed": False,
    "createdAt": "2026-09-23T12:00:00Z",
}

EVALUATION: dict[str, object] = {
    "schemaVersion": "ai-workflow/1",
    "attemptId": "attempt-test-1",
    "mode": "operator112",
    "status": "pending",
    "revision": 1,
    "availableAxes": ["timeScore", "correctnessScore"],
    "etalonVersion": "etalon-test-1",
    "assessorVersion": "assessor-test-1",
    "modelReleaseId": None,
    "errors": [ERROR_RECORD],
    "axes": {"timeScore": 90, "correctnessScore": 80, "grammarScore": None, "semanticScore": None},
    "createdAt": "2026-09-23T12:00:00Z",
}

REPORT: dict[str, object] = {
    "schemaVersion": "ai-workflow/1",
    "sessionId": "session-test-1",
    "generatedAt": "2026-09-23T12:00:00Z",
    "attemptIds": ["attempt-test-1"],
    "errorCounts": {"wrongAddress": 1},
    "reviewPendingCount": 0,
    "modeBreakdown": {"operator112": 1, "dds": 0},
    "effectiveScores": {"attempt-test-1": 80},
    "errorRecordIds": ["error-test-1"],
}

VALID_RESOURCES = [
    ("scenario", SCENARIO),
    ("event", EVENT),
    ("evaluation", EVALUATION),
    ("report", REPORT),
]

INVALID_RESOURCES = [
    pytest.param(
        "scenario", {**SCENARIO, "validation": "failed"}, id="scenario-approved-requires-passed-validation"
    ),
    pytest.param(
        "scenario",
        {**SCENARIO, "sourceKind": "student_card", "approval": "pending_review"},
        id="scenario-student-card-requires-provenance",
    ),
    pytest.param("event", {**EVENT, "seq": -1}, id="event-negative-sequence"),
    pytest.param("event", {**EVENT, "occurredAt": "not-a-date-time"}, id="event-invalid-date-time"),
    pytest.param("evaluation", {**EVALUATION, "totalScore": 80}, id="evaluation-pending-forbids-total-score"),
    pytest.param("evaluation", {**EVALUATION, "status": "final"}, id="evaluation-final-requires-total-score"),
    pytest.param(
        "evaluation",
        {**EVALUATION, "errors": [{**ERROR_RECORD, "severity": "urgent"}]},
        id="evaluation-error-record-rejects-invalid-severity",
    ),
    pytest.param(
        "evaluation",
        {
            **EVALUATION,
            "errors": [{key: value for key, value in ERROR_RECORD.items() if key != "sourceRef"}],
        },
        id="evaluation-error-record-requires-source-ref",
    ),
    pytest.param(
        "evaluation",
        {**EVALUATION, "errors": [{**ERROR_RECORD, "unexpected": "value"}]},
        id="evaluation-error-record-rejects-extra-fields",
    ),
    pytest.param("report", {**REPORT, "reviewPendingCount": -1}, id="report-negative-review-count"),
    pytest.param("report", {**REPORT, "modeBreakdown": {"operator112": 1}}, id="report-requires-both-modes"),
]


def load_schema(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def validator_for(path: Path) -> Draft202012Validator:
    return Draft202012Validator(load_schema(path), format_checker=FormatChecker())


@pytest.mark.parametrize(
    "schema_path",
    [*AI_SCHEMA_PATHS.values(), LEGACY_EVALUATION_SCHEMA],
    ids=[*AI_SCHEMA_PATHS, "legacy-evaluation"],
)
def test_схемы_валидны_для_черновика_2020_12(schema_path: Path) -> None:
    # Arrange
    schema = load_schema(schema_path)

    # Act / Assert
    assert schema["$schema"] == DRAFT_2020_12
    Draft202012Validator.check_schema(schema)


@pytest.mark.parametrize(
    ("schema_name", "resource"), VALID_RESOURCES, ids=[name for name, _ in VALID_RESOURCES]
)
def test_новый_ресурс_соответствует_контракту(schema_name: str, resource: dict[str, object]) -> None:
    # Arrange
    validator = validator_for(AI_SCHEMA_PATHS[schema_name])

    # Act
    errors = list(validator.iter_errors(copy.deepcopy(resource)))

    # Assert
    assert not errors, "; ".join(error.message for error in errors)


@pytest.mark.parametrize(
    ("schema_name", "resource"),
    INVALID_RESOURCES,
)
def test_новый_ресурс_отклоняет_нарушения_контракта(schema_name: str, resource: dict[str, object]) -> None:
    # Arrange
    validator = validator_for(AI_SCHEMA_PATHS[schema_name])

    # Act / Assert
    assert not validator.is_valid(copy.deepcopy(resource))


async def test_старый_api_evaluation_совместим_с_неизменной_схемой(client: AsyncClient) -> None:
    # Arrange
    await login_as(client, "teacher")
    validator = validator_for(LEGACY_EVALUATION_SCHEMA)

    # Act
    response = await client.get("/attempts/att-01/evaluation")

    # Assert
    assert response.status_code == 200, response.text
    errors = list(validator.iter_errors(response.json()))
    assert not errors, "; ".join(error.message for error in errors)


PYDANTIC_MODELS = {
    "scenario": ScenarioVersion,
    "event": AttemptEvent,
    "evaluation": EvaluationRevision,
    "report": SessionReport,
}


@pytest.mark.parametrize(
    ("schema_name", "resource"), VALID_RESOURCES, ids=[name for name, _ in VALID_RESOURCES]
)
def test_pydantic_схемы_сохраняют_проводную_форму_контракта(
    schema_name: str, resource: dict[str, object]
) -> None:
    # Arrange / Act
    result = PYDANTIC_MODELS[schema_name].model_validate(copy.deepcopy(resource)).dump()
    errors = list(validator_for(AI_SCHEMA_PATHS[schema_name]).iter_errors(result))

    # Assert
    assert not errors, "; ".join(error.message for error in errors)
    if schema_name == "evaluation":
        assert result["modelReleaseId"] is None


@pytest.mark.parametrize(
    "resource",
    [
        {**EVALUATION, "schemaVersion": "ai-workflow/2"},
        {key: value for key, value in EVALUATION.items() if key != "assessorVersion"},
        {**EVALUATION, "mode": "dispatcher"},
        {**EVALUATION, "totalScore": 80},
        {**EVALUATION, "status": "final"},
    ],
    ids=["wrong-schema-version", "missing-assessor-version", "unknown-mode", "pending-score", "final-without-score"],
)
def test_pydantic_оценка_отклоняет_неполные_и_противоречивые_данные(resource: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        EvaluationRevision.model_validate(resource)


def test_pydantic_сценарий_не_принимает_автора_из_payload() -> None:
    model = ScenarioVersion.model_validate(
        {
            **SCENARIO,
            "createdBy": "attacker-teacher",
            "futureExtension": {"source": "approved-ticket"},
        }
    )

    assert "createdBy" not in model.dump()
    assert model.dump()["futureExtension"] == {"source": "approved-ticket"}


def test_pydantic_error_record_сохраняет_допустимые_пустые_необязательные_строки() -> None:
    error_record = {
        **ERROR_RECORD,
        "fieldPath": "",
        "eventId": "",
        "expected": "",
        "assessorVersion": "",
        "teacherId": "",
    }
    resource = {**EVALUATION, "errors": [error_record]}

    result = EvaluationRevision.model_validate(resource).dump()
    errors = list(validator_for(AI_SCHEMA_PATHS["evaluation"]).iter_errors(result))

    assert not errors, "; ".join(error.message for error in errors)


def test_pydantic_решение_семантики_совместимо_с_ai_extension() -> None:
    resource = {
        "decision": "uncertain",
        "referenceFactIds": ["fact-1"],
        "explanation": "Недостаточно подтверждённых фактов",
        "confidence": 0.4,
    }
    schema_path = CONTRACTS_DIR / "semantic-review-v1.schema.json"
    result = SemanticDecision.model_validate(resource).dump()

    assert not list(validator_for(schema_path).iter_errors(result))
    with pytest.raises(ValidationError):
        SemanticDecision.model_validate({**resource, "decision": "guess"})
    with pytest.raises(ValidationError):
        SemanticDecision.model_validate({**resource, "confidence": True})
