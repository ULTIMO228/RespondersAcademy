"""Фикстура цепочки A → B для демо и e2e (спека 002, T031). НЕ публичный API и не часть `app.seed.load`.

Задание `chain` требует утверждённую версию `operator112`, а она рождается из ИИ-черновика по одобренной записи
`SanitizedTicket`; публичного API для этой записи нет (её вставляет прямая запись в БД — так же делает
`tests/integration/test_ai_chain.py`). Скрипт повторяет рецепт теста поверх уже засеянной БД:

  1. вставляет одобренный очищенный билет;
  2. от имени преподавателя `morozova` создаёт ИИ-черновик `operator112` и утверждает его (те же эндпоинты, что у UI);
  3. создаёт задание `chain` для `ivanov` с включёнными сообщениями служб (короткие интервалы для демонстрации).

Запуск (после `python -m app.seed.load`): `cd backend && uv run python scripts/seed_chain_demo.py`. Повторный запуск
ничего не дублирует. В stdout — JSON с id задания и сценария (для e2e).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("ML_WARMUP", "0")

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db.session import get_sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.ai_scenario import SanitizedTicket, ScenarioVersion  # noqa: E402
from app.models.assignment import Assignment, AssignmentScenarioVersion  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.security import build_auth_session  # noqa: E402
from app.services.time import now_iso  # noqa: E402

TEACHER_LOGIN = "morozova"
STUDENT_ID = "u-005"  # ivanov
DEMO_TITLE = "Цепочка 112 → ДДС (демо)"
SOURCE_TICKET_ID = "demo-chain-source"
CATEGORY = "Дерево"
SANITIZED_TEXT = "Сильный ветер повалил дерево на проезжую часть, пострадавших нет"
# Четыре возрастающие секунды от принятия карточки: выезд, прибытие, начало работ, завершение (по умолчанию 20/50/90/150).
WORK_MESSAGE_INTERVALS_SEC = [5, 10, 15, 20]


async def seed_chain_demo() -> dict[str, str]:
    async with get_sessionmaker()() as db:
        existing = (await db.execute(select(Assignment).where(Assignment.title == DEMO_TITLE))).scalars().first()
        if existing is not None:
            link = (await db.execute(select(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id == existing.id))).scalars().first()
            version = await db.get(ScenarioVersion, (link.scenario_id, link.version)) if link else None
            address = version.card_snapshot["fields"]["address"] if version else ""
            return {"assignmentId": existing.id, "address": address, "status": "exists"}
        teacher = (await db.execute(select(User).where(User.login == TEACHER_LOGIN))).scalar_one_or_none()
        if teacher is None:
            raise SystemExit(f"Нет учётной записи «{TEACHER_LOGIN}»: сначала `python -m app.seed.load`")
        if await db.get(SanitizedTicket, (SOURCE_TICKET_ID, 1)) is None:
            db.add(
                SanitizedTicket(
                    source_ticket_id=SOURCE_TICKET_ID,
                    situation_no=1,
                    sanitized_text=SANITIZED_TEXT,
                    pii_check="passed",
                    reviewer_id=teacher.id,
                    reviewed_at=now_iso(),
                    source_hash=hashlib.sha256(SANITIZED_TEXT.encode()).hexdigest(),
                    approved=True,
                )
            )
        session = await build_auth_session(db, teacher)
        await db.commit()

    transport = ASGITransport(app=create_app())
    async with AsyncClient(
        transport=transport, base_url="http://demo/api/v1", headers={"authorization": f"Bearer {session['token']}"}
    ) as client:
        drafts = await client.post(
            "/ai/scenarios/drafts",
            json={
                "mode": "operator112",
                "sourceTicketId": SOURCE_TICKET_ID,
                "category": CATEGORY,
                "count": 1,
                "requestId": "demo-chain-drafts",
            },
        )
        drafts.raise_for_status()
        version = drafts.json()[0]
        scenario_id, card_id = version["scenarioId"], version["cardSnapshot"]["id"]
        approved = await client.post(
            f"/ai/scenarios/{scenario_id}/approve", json={"version": version["version"], "requestId": "demo-chain-approve"}
        )
        approved.raise_for_status()
        assignment = await client.post(
            "/assignments",
            json={
                "studentIds": [STUDENT_ID],
                "trainingMode": "chain",
                "format": "training",
                "cardIds": [card_id],
                "scenarioVersions": [{"scenarioId": scenario_id, "version": version["version"], "cardId": card_id}],
                "params": {"workMessagesEnabled": True, "workMessageIntervalsSec": WORK_MESSAGE_INTERVALS_SEC},
                "title": DEMO_TITLE,
            },
        )
        assignment.raise_for_status()
    # address — точный адрес карточки сценария: структурная проверка входа ДДС принимает только адреса локального справочника адресов.
    return {
        "assignmentId": assignment.json()["id"],
        "scenarioId": scenario_id,
        "cardId": card_id,
        "address": version["cardSnapshot"]["fields"]["address"],
        "status": "created",
    }


def main() -> None:
    print(json.dumps(asyncio.run(seed_chain_demo()), ensure_ascii=False))


if __name__ == "__main__":
    main()
