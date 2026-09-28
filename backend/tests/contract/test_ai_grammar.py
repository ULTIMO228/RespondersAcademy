"""T052 (US3): контракт `POST /grammar-check` — совместимость, привязка к полю/фрагменту и версии сценария.

Проверка без LLM (symspell + доменный словарь + справочник улиц); текст никогда не исправляется сервером —
ответ содержит только замечания. Без `scenarioId` форма ответа прежняя (`GrammarError[]` из пяти полей).
"""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import login_as
from tests.contract.test_ai_scenarios import (  # noqa: F401
    cleanup_ai_scenario_contracts,
    draft_body,
    seed_source,
    v1,
)

LEGACY_FIELDS = {"field", "fragment", "wrong", "expected", "type"}
TYPO_TEXT = "Сильный ветер повалил дерево, бригадда направлена"
FIXED_TEXT = "Сильный ветер повалил дерево, бригада направлена"


async def create_ai_scenario(v1: AsyncClient, source_id: str) -> str:  # noqa: F811
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, f"{source_id}-create"))
    assert created.status_code == 201, created.text
    return created.json()[0]["scenarioId"]


async def revise_summary(v1: AsyncClient, scenario_id: str, base_version: int, text: str, request_id: str) -> dict:  # noqa: F811
    revised = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={
            "baseVersion": base_version,
            "comment": "Правка фабулы преподавателем",
            "acceptedFields": [{"fieldPath": "summary", "decision": "edited", "value": text}],
            "requestId": request_id,
        },
    )
    assert revised.status_code == 201, revised.text
    return revised.json()


async def test_legacy_contract_without_scenario_is_unchanged(client: AsyncClient) -> None:
    client.cookies.clear()
    response = await client.post("/grammar-check", json={"text": TYPO_TEXT, "field": "summary"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"origin", "provider", "data"} and body["origin"] == "ai" and body["provider"] == "service"
    assert body["data"] == [
        {"field": "summary", "fragment": "дерево, бригадда", "wrong": "бригадда", "expected": "бригада", "type": "spelling"}
    ]
    assert all(set(item) == LEGACY_FIELDS for item in body["data"])


async def test_empty_text_and_professional_terms_give_no_remarks(client: AsyncClient) -> None:
    client.cookies.clear()
    for text in ("", "   "):
        response = await client.post("/grammar-check", json={"text": text, "field": "summary"})
        assert response.status_code == 200 and response.json()["data"] == []
    terms = "Информация передана в ЦУКБ, ПСЦ и ОИВ, ЕДДС оповещена, код ЕКП уточнён, АСМ направлена"
    assert (await client.post("/grammar-check", json={"text": terms, "field": "dispatcherAction"})).json()["data"] == []
    unknown_street = await client.post("/grammar-check", json={"text": "Москва, ул. Несуществующая, 5", "field": "address"})
    assert unknown_street.status_code == 200 and unknown_street.json()["data"] == []


async def test_remarks_point_to_source_fragment_without_rewriting_text(client: AsyncClient) -> None:
    client.cookies.clear()
    text = "Сообщение, пренято;  механик напрален"
    response = await client.post("/grammar-check", json={"text": text, "field": "dispatcherAction"})
    data = response.json()["data"]
    assert data and all(item["field"] == "dispatcherAction" for item in data)
    assert all(item["wrong"] in text and item["fragment"] in text for item in data)
    assert {item["wrong"] for item in data if item["type"] == "spelling"} == {"пренято", "напрален"}
    assert "text" not in response.json() and all("text" not in item for item in data)


async def test_binding_requires_teacher_and_existing_scenario(client: AsyncClient) -> None:
    client.cookies.clear()
    body = {"text": TYPO_TEXT, "field": "summary", "scenarioId": "s-032"}
    assert (await client.post("/grammar-check", json=body)).status_code == 401
    await login_as(client, "student")
    assert (await client.post("/grammar-check", json=body)).status_code == 403
    await login_as(client, "teacher")
    missing = await client.post("/grammar-check", json={**body, "scenarioId": "s-999"})
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "notFound"
    for bad in (0, -1, "abc", 1.5):
        assert (await client.post("/grammar-check", json={**body, "scenarioVersion": bad})).status_code == 400
    # Шаблонный сценарий без AI-версий: замечания привязаны к сценарию, версии нет.
    template = await client.post("/grammar-check", json=body)
    assert template.status_code == 200
    assert [(item["scenarioId"], "scenarioVersion" in item) for item in template.json()["data"]] == [("s-032", False)]
    no_versions = await client.post("/grammar-check", json={**body, "scenarioVersion": 1})
    assert no_versions.status_code == 404
    client.cookies.clear()


async def test_recheck_after_teacher_edit_is_bound_to_current_version(client: AsyncClient, v1: AsyncClient) -> None:  # noqa: F811
    scenario_id = await create_ai_scenario(v1, "t009-t052-grammar-source")
    await login_as(client, "teacher")

    first = await client.post(
        "/grammar-check",
        json={"text": TYPO_TEXT, "field": "summary", "scenarioId": scenario_id, "scenarioVersion": 1},
    )
    assert first.status_code == 200, first.text
    assert first.json()["data"] == [
        {
            "field": "summary",
            "fragment": "дерево, бригадда",
            "wrong": "бригадда",
            "expected": "бригада",
            "type": "spelling",
            "scenarioId": scenario_id,
            "scenarioVersion": 1,
        }
    ]
    repeat = await client.post(
        "/grammar-check",
        json={"text": TYPO_TEXT, "field": "summary", "scenarioId": scenario_id, "scenarioVersion": 1},
    )
    assert repeat.json() == first.json()

    version_two = await revise_summary(v1, scenario_id, 1, FIXED_TEXT, "t009-t052-grammar-revise")
    assert version_two["version"] == 2

    stale = await client.post(
        "/grammar-check",
        json={"text": TYPO_TEXT, "field": "summary", "scenarioId": scenario_id, "scenarioVersion": 1},
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "conflict"

    fixed = await client.post(
        "/grammar-check",
        json={"text": FIXED_TEXT, "field": "summary", "scenarioId": scenario_id, "scenarioVersion": 2},
    )
    assert fixed.status_code == 200 and fixed.json()["data"] == []

    current = await client.post("/grammar-check", json={"text": TYPO_TEXT, "field": "summary", "scenarioId": scenario_id})
    assert [(item["wrong"], item["scenarioVersion"]) for item in current.json()["data"]] == [("бригадда", 2)]
    client.cookies.clear()
