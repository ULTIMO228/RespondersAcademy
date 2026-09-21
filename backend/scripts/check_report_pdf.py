"""Ручная визуальная проверка: python scripts/check_report_pdf.py; затем pdftoppm var/report-export-qa.pdf."""

import asyncio
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine

from app.api.deps import Viewer
from app.db.session import configure_engine, get_sessionmaker
from app.seed.load import run_seed
from app.services.report_export import export_data, render_pdf


async def main():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    configure_engine(engine)
    await run_seed(reset=True)
    async with get_sessionmaker()() as db:
        data = await export_data(db, 'rep-2026-09-16-group', Viewer('u-002', 'teacher'))
    # Проверяем длинные имена, спецсимволы, повтор шапок и перенос таблиц на новых страницах.
    data['rows'] *= 8
    data['rows'][0] = [*data['rows'][0]]
    data['rows'][0][0] = 'Тестовый обучаемый <проверка> с длинным именем и фамилией'
    data['rows'][0][10] = 'spelling: 12; syntax: 3; timing: 2; decision: 1'
    out = Path('var/report-export-qa.pdf')
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(render_pdf(data))
    empty = {**data, 'rows': [], 'insights': []}
    Path('var/report-export-empty-qa.pdf').write_bytes(render_pdf(empty))
    print(out.resolve())
    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
