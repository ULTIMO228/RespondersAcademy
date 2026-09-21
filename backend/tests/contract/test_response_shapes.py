"""T073: формы ответов GET-эндпоинтов таблицы контракта ⊇ обязательные поля TS-типов фронта.

`expected_fields.json` собирается `scripts/extract_ts_fields.py` из `src/shared/api/types/*.ts` (обязательные =
объявлены без `?`). Для каждого эндпоинта задан тип верхнего уровня и вложенные коллекции; проверяется, что
у каждого объекта есть все обязательные поля (лишние поля-расширения допустимы).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import login_as

EXPECTED = json.loads((Path(__file__).parent / "expected_fields.json").read_text(encoding="utf-8"))["types"]

# (путь, роль для входа или None, тип, форма, вложенные)
ENDPOINTS: list[tuple[str, str | None, str, str, dict[str, tuple[str, str]]]] = [
    ("/auth/policy", None, "AuthPolicy", "object", {}),
    ("/reference", None, "ReferenceData", "object", {"ddsStatuses": ("DdsStatusDef", "list"), "services": ("ServiceRef", "list"), "internalNumbers": ("InternalNumber", "list"), "districts": ("District", "list")}),
    ("/classifier", None, "ClassifierEntry", "list", {"notifications": ("ServiceNotification", "list")}),
    ("/cards?perPage=5", None, "ArmCardFixture", "page", {"workLines": ("WorkLine", "list"), "phones": ("ArmCardPhones", "object"), "address": ("ArmCardAddress", "object"), "what": ("ArmCardWhat", "object")}),
    ("/cards/c-001", None, "CardDetailsTraining", "object", {"card": ("IncidentCard", "object"), "runtime": ("CardRuntimeState", "object")}),
    ("/cards/c-001/sms", None, "CardSms", "list", {}),
    ("/scenarios", None, "Scenario", "list", {"timeNorms": ("ScenarioTimeNorms", "object")}),
    ("/scenarios/s-001", None, "Scenario", "object", {}),
    ("/training-cards", None, "IncidentCard", "list", {"caller": ("IncidentCaller", "object")}),
    ("/materials", None, "TrainingMaterial", "list", {}),
    ("/profile-mapping", None, "ProfileMappingRow", "list", {}),
    ("/sessions", "teacher", "Session", "list", {"cardEvents": ("CardEvent", "list"), "cardFlow": ("CardFlowItem", "list")}),
    ("/sessions/ses-2026-09-16-01/feed", "teacher", "SessionFeedResponse", "object", {"events": ("SessionFeedEvent", "list")}),
    ("/sessions/ses-2026-09-16-01/control", "teacher", "SessionControlResponse", "object", {"session": ("Session", "object")}),
    ("/users", "teacher", "PublicUser", "list", {}),
    ("/reports?sessionId=ses-2026-09-16-01", "teacher", "ReportsResponse", "object", {"reports": ("Report", "list")}),
    ("/reports/journal", "teacher", "ReportJournalResponse", "object", {"rows": ("ReportJournalRow", "list"), "filters": ("ReportJournalFilters", "object")}),
    ("/attempts/att-01/evaluation", "teacher", "Evaluation", "object", {"errors": ("EvaluationError", "list"), "grammarErrors": ("GrammarError", "list")}),
    ("/admin/users", "admin", "PublicUser", "list", {}),
    ("/admin/services", "admin", "SystemService", "list", {}),
    ("/admin/settings", "admin", "SystemSettings", "object", {}),
    ("/admin/system/settings", "admin", "SystemSettings", "object", {}),
    ("/admin/audit", "admin", "AuditLogEntry", "page", {}),
    ("/admin/system/services", "admin", "SystemServicesResponse", "object", {"services": ("SystemService", "list"), "integrity": ("SystemIntegrity", "object")}),
    ("/admin/system/logs", "admin", "SystemLogEntry", "list", {}),
    ("/admin/system/monitoring", "admin", "SystemMonitoring", "object", {}),
    ("/admin/system/usage-stats", "admin", "UsageStats", "object", {"periods": ("UsageStatsPeriod", "list")}),
]

# Объединения и generics, которые парсер TS не раскрывает, задаются явно.
MANUAL_TYPES: dict[str, list[str]] = {
    "CardDetailsTraining": ["kind", "card", "resolvedFixtureId", "runtime"],
    "PageResponse": ["items", "total", "page", "perPage"],
    "SessionFeedEvent": ["at", "studentId", "cardId", "kind"],  # SessionFeedEventBase & { kind, … } — объединение по kind
}


def required_fields(type_name: str) -> list[str]:
    if type_name in MANUAL_TYPES:
        return MANUAL_TYPES[type_name]
    assert type_name in EXPECTED, f"тип {type_name} не найден в expected_fields.json — перегенерируйте scripts/extract_ts_fields.py"
    return EXPECTED[type_name]["required"]


def assert_shape(value: Any, type_name: str, shape: str, where: str) -> list[dict[str, Any]]:
    """Проверяет объект/список/страницу и возвращает объекты для вложенных проверок."""
    if shape == "page":
        assert isinstance(value, dict) and not set(MANUAL_TYPES["PageResponse"]) - set(value), f"{where}: PageResponse"
        return assert_shape(value["items"], type_name, "list", f"{where}.items")
    if shape == "list":
        assert isinstance(value, list), f"{where}: ожидался список"
        for index, item in enumerate(value):
            assert_shape(item, type_name, "object", f"{where}[{index}]")
        return [item for item in value if isinstance(item, dict)]
    assert isinstance(value, dict), f"{where}: ожидался объект {type_name}"
    missing = [field for field in required_fields(type_name) if field not in value]
    assert not missing, f"{where} ({type_name}): нет обязательных полей {missing}; есть {sorted(value)}"
    return [value]


@pytest.mark.parametrize(("path", "role", "type_name", "shape", "nested"), ENDPOINTS, ids=[e[0] for e in ENDPOINTS])
async def test_response_shape(client: AsyncClient, path: str, role: str | None, type_name: str, shape: str, nested: dict[str, tuple[str, str]]):
    if role:
        await login_as(client, role)
    response = await client.get(path)
    assert response.status_code == 200, f"{path}: {response.status_code} {response.text[:300]}"
    objects = assert_shape(response.json(), type_name, shape, path)
    assert objects or shape == "list", f"{path}: пустой ответ не проверяет форму"
    for key, (nested_type, nested_shape) in nested.items():
        for index, obj in enumerate(objects):
            assert key in obj, f"{path}[{index}]: нет поля {key}"
            assert_shape(obj[key], nested_type, nested_shape, f"{path}[{index}].{key}")


def test_expected_fields_are_fresh():
    """Файл соответствует текущим TS-типам (запуск скрипта без записи на диск)."""
    from scripts.extract_ts_fields import extract

    current = extract()
    stale = {name for name, entry in current.items() if EXPECTED.get(name, {}).get("required") != entry["required"]}
    assert not stale, f"expected_fields.json устарел для {sorted(stale)}: uv run python scripts/extract_ts_fields.py"
