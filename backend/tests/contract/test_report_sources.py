from __future__ import annotations

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.report import GroupReport, Report
from tests.conftest import login_as

SESSION_ID = "ses-2026-09-16-01"


async def test_report_api_exposes_saved_ai_text_sources(client) -> None:
    async with get_sessionmaker()() as db:
        report = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalars().first()
        group = (await db.execute(select(GroupReport).where(GroupReport.session_id == SESSION_ID))).scalars().first()
        assert report is not None and group is not None
        original_comment = report.ai_comment
        original_comment_source = report.ai_comment_source
        original_insights_source = group.group_insights_source
        report.ai_comment = "Сохранённый комментарий модели."
        report.ai_comment_source = "local"
        group.group_insights_source = "cloud"
        await db.commit()

    try:
        await login_as(client, "admin")
        response = await client.get(f"/reports?sessionId={SESSION_ID}")
        assert response.status_code == 200, response.text
        payload = response.json()
        report_payload = next(item for item in payload["reports"] if item["aiComment"] == "Сохранённый комментарий модели.")
        assert report_payload["aiCommentSource"] == "local"
        assert payload["groupReport"]["groupInsightsSource"] == "cloud"
    finally:
        async with get_sessionmaker()() as db:
            saved_report = (await db.execute(select(Report).where(Report.session_id == SESSION_ID))).scalars().first()
            saved_group = (await db.execute(select(GroupReport).where(GroupReport.session_id == SESSION_ID))).scalars().first()
            assert saved_report is not None and saved_group is not None
            saved_report.ai_comment = original_comment
            saved_report.ai_comment_source = original_comment_source
            saved_group.group_insights_source = original_insights_source
            await db.commit()
