"""Добавляет утверждённый очищенный билет `demo-fire-1` для проверки ИИ-генерации карточек в UI (запись напрямую в БД).

    cd backend && uv run python scripts/seed_ai_demo_source.py
В кабинете преподавателя: идентификатор билета `demo-fire-1`, категория `пожар в жилом доме`.
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import get_sessionmaker  # noqa: E402
from app.models.ai_scenario import SanitizedTicket  # noqa: E402

TEXT = "Горит балкон и два окна на 13-м этаже жилого дома, открытое пламя, дом газифицирован, пострадавших нет"


async def main() -> None:
    async with get_sessionmaker()() as db:
        if await db.get(SanitizedTicket, ("demo-fire-1", 1)) is None:
            db.add(
                SanitizedTicket(
                    source_ticket_id="demo-fire-1",
                    situation_no=1,
                    sanitized_text=TEXT,
                    pii_check="passed",
                    reviewer_id="u-002",
                    reviewed_at="2026-09-29T10:00:00+00:00",
                    source_hash=hashlib.sha256(TEXT.encode()).hexdigest(),
                    approved=True,
                )
            )
            await db.commit()
    print("demo-fire-1 готов")


asyncio.run(main())
