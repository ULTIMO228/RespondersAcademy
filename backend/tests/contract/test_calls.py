"""T066: контракт строк 16–17 (docs/mock-api.md): POST /cards/{id}/calls, POST /calls/reply.

Независимый тест US10: вызов пишется в попытку курсанта (201, attemptId), ИИ-абонент отвечает «Слушаю…»,
неизвестный номер → 404 «Абонент не найден»; доклад без номера карточки → в оценке «не назван номер карточки».
"""

from __future__ import annotations

import datetime as dt

from httpx import AsyncClient

from app import ai_gateway
from tests.conftest import login_as

CARD_ID = "c-062"  # s-021, у демо-курсантов нет сидовых попыток (в отличие от c-063)
# Доклад по c-062 без номера карточки: тип, адрес, пострадавшие и решение названы.
REPORT_WITHOUT_CARD_NUMBER = "Скорая и неотложная помощь, дорога от Клина в сторону Лотошино, дом напротив остановки у церкви, одна пострадавшая, травма руки, кровотечение, карточка принята, бригада направлена"


def _now(offset_seconds: int = 0) -> str:
    moment = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(seconds=offset_seconds)
    return moment.isoformat(timespec="seconds")


def _transcript(report: str) -> list[dict[str, str]]:
    return [
        {"speaker": "ai", "text": "Слушаю вас", "at": _now(-40)},
        {"speaker": "dispatcher", "text": report, "at": _now(-30)},
        {"speaker": "ai", "text": "Понял, информация принята", "at": _now(-20)},
    ]


async def test_call_reply_contract(client: AsyncClient):
    answer = await client.post("/calls/reply", json={"toNumber": "101", "turn": "answer"})
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["origin"] == "ai" and body["provider"] == "service"
    assert body["data"]["text"].startswith("Слушаю") and body["data"]["voice"] in ("male", "female")
    assert body["data"]["speakerTitle"] == "Учебный номер Службы 101 (МЧС)"

    confirmed = await client.post("/calls/reply", json={"toNumber": "301", "turn": "reply", "text": "Карточка c-063, принята"})
    assert confirmed.status_code == 200 and "принята" in confirmed.json()["data"]["text"]
    assert confirmed.json()["data"]["speakerTitle"] == "Руководитель дежурной смены ДДС"

    # Голос детерминирован по номеру и различается между службами (вариативность м/ж).
    voices = {(await client.post("/calls/reply", json={"toNumber": n, "turn": "answer"})).json()["data"]["voice"] for n in ("101", "102")}
    assert voices == {"male", "female"}

    unknown = await client.post("/calls/reply", json={"toNumber": "999", "turn": "answer"})
    assert unknown.status_code == 404 and unknown.json()["error"]["message"] == "Абонент не найден"

    assert (await client.post("/calls/reply", json={"toNumber": "101", "turn": "hangup"})).status_code == 400
    assert (await client.post("/calls/reply", json={"turn": "answer"})).status_code == 400
    no_text = await client.post("/calls/reply", json={"toNumber": "101", "turn": "reply"})
    assert no_text.status_code == 400 and no_text.json()["error"]["code"] == "validationFailed"


async def test_call_reply_prefers_ai_gateway(client: AsyncClient):
    class ExternalGateway(ai_gateway.LocalAiGateway):
        def call_reply(self, to_number, turn, context):
            assert context["number"]["number"] == to_number and "reference" in context
            return {"text": f"Внешний ответ {turn}", "voice": "female", "speakerTitle": "Внешний ИИ"}

    ai_gateway.set_gateway(ExternalGateway())
    try:
        response = await client.post("/calls/reply", json={"toNumber": "102", "turn": "answer"})
        assert response.status_code == 200 and response.json()["data"] == {"text": "Внешний ответ answer", "voice": "female", "speakerTitle": "Внешний ИИ"}
    finally:
        ai_gateway.set_gateway(None)


async def test_card_call_recorded_and_report_checked(client: AsyncClient):
    session = await login_as(client, "student")
    student_id = session["userId"]

    # До открытия карточки попытки нет — вызов не записывается.
    payload = {"studentId": student_id, "toNumber": "301", "startedAt": _now(-40), "endedAt": _now(-20), "transcript": _transcript(REPORT_WITHOUT_CARD_NUMBER)}
    missing_attempt = await client.post(f"/cards/{CARD_ID}/calls", json=payload)
    assert missing_attempt.status_code == 404 and "не открыта" in missing_attempt.json()["error"]["message"]

    opened = await client.post(f"/cards/{CARD_ID}/attempt", json={"studentId": student_id, "issuedAt": _now(-60)})
    assert opened.status_code in (200, 201), opened.text
    attempt_id = opened.json()["attempt"]["id"]

    recorded = await client.post(f"/cards/{CARD_ID}/calls", json=payload)
    assert recorded.status_code == 201, recorded.text
    body = recorded.json()
    assert body["attemptId"] == attempt_id and body["sessionId"].startswith("ses-")
    call = body["call"]
    assert call["id"].startswith("call-") and call["fromUserId"] == student_id and call["toNumber"] == "301"
    assert len(call["transcript"]) == 3 and call["transcript"][1]["speaker"] == "dispatcher"
    # Расширение: сверка доклада с фактами карточки — номер карточки не назван.
    report = call["report"]
    assert {c["id"] for c in report["checks"]} == {"cardNumber", "address", "type", "victims", "decision"}
    assert "номер карточки" in report["missing"] and 0 < report["score"] < 1

    # Вызов виден в попытке (CardEvent.calls).
    mine = await client.get("/sessions", params={"studentId": student_id})
    attempts = [e for s in mine.json() for e in s["cardEvents"] if e["id"] == attempt_id]
    assert attempts and attempts[0]["calls"][-1]["id"] == call["id"]

    # Оценка после завершения: неполный доклад отмечен ошибкой reportIncomplete с пропущенным пунктом.
    done = await client.post(f"/attempts/{attempt_id}/progress", json={"status": {"ddsStatus": "accepted", "at": _now(-50)}, "completedAt": _now()})
    assert done.status_code == 200, done.text
    evaluation = await client.get(f"/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200, evaluation.text
    incomplete = [e for e in evaluation.json()["errors"] if e["type"] == "reportIncomplete"]
    assert incomplete and "номер карточки" in incomplete[0]["message"], evaluation.json()["errors"]


async def test_card_call_validation_and_not_found(client: AsyncClient):
    session = await login_as(client, "student2")
    student_id = session["userId"]
    base = {"studentId": student_id, "toNumber": "301", "startedAt": _now(-40), "endedAt": _now(-20), "transcript": []}

    assert (await client.post("/cards/c-999/calls", json=base)).status_code == 404
    unknown_number = await client.post(f"/cards/{CARD_ID}/calls", json={**base, "toNumber": "999"})
    assert unknown_number.status_code == 404 and unknown_number.json()["error"]["message"] == "Абонент не найден"

    for broken in (
        {**base, "studentId": ""},
        {**base, "startedAt": "вчера"},
        {**base, "endedAt": _now(-50)},
        {**base, "transcript": "нет"},
        {**base, "transcript": [{"speaker": "robot", "text": "x", "at": _now()}]},
    ):
        response = await client.post(f"/cards/{CARD_ID}/calls", json=broken)
        assert response.status_code == 400 and response.json()["error"]["code"] == "validationFailed", response.text

    # Студент не пишет вызовы за другого курсанта.
    foreign = await client.post(f"/cards/{CARD_ID}/calls", json={**base, "studentId": "u-005"})
    assert foreign.status_code == 403
