"""Демо-источник для конструктора сценариев 112 (спека 005): одна утверждённая очищенная ситуация.

Преподаватель создаёт сценарий из `sourceTicketId` реестра `SanitizedTicket`; в чистой базе реестр пуст, поэтому
для сквозной проверки (`run_frontend_e2e.sh --only scenario-graph`) добавляется синтетическая ситуация без персональных данных.

    cd backend && uv run python scripts/seed_scenario_graph_demo.py

Повторный запуск ничего не дублирует. В stdout — JSON со сводкой.
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

SOURCE_ID = "e2e-graph-source"
TEXT = "Сильный ветер повалил дерево на проезжую часть, пострадавших нет"


async def main() -> None:
    from app.db.session import get_sessionmaker
    from app.models.ai_scenario import SanitizedTicket

    async with get_sessionmaker()() as db:
        if await db.get(SanitizedTicket, (SOURCE_ID, 1)) is None:
            db.add(
                SanitizedTicket(
                    source_ticket_id=SOURCE_ID, situation_no=1, sanitized_text=TEXT, pii_check="passed",
                    reviewer_id="u-002", reviewed_at="2026-10-20T10:00:00+00:00",
                    source_hash=hashlib.sha256(TEXT.encode()).hexdigest(), approved=True,
                )
            )
            await db.commit()
    print(json.dumps({"sourceTicketId": SOURCE_ID, "situationNo": 1}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
