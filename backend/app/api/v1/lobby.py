"""Лобби: профиль, история, аналитика и справочник ситуаций."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_role, require_viewer
from app.api.errors import forbidden, not_found, validation_failed
from app.db.session import get_db
from app.models.kb import KbArticle as KbArticleRow
from app.models.user import User
from app.schemas.common import page_response, read_one_of, read_page, read_string
from app.schemas.scenarios import parse_body
from app.schemas.v1.lobby import Analytics, HistoryItem, KbArticle, KbArticlePatch
from app.services import analytics, audit
from app.services.time import now_iso

router = APIRouter()
teacher_or_admin = require_role("teacher", "admin")


@router.get("/me")
async def me(db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    user = await db.get(User, viewer.user_id)
    if user is None:
        raise not_found("Пользователь не найден")
    return user.to_public()


@router.get("/me/history")
async def history(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    params = request.query_params
    requested = read_string(params, "studentId")
    if requested and requested != viewer.user_id:
        raise forbidden("Доступна только собственная история")
    mode = read_one_of(params, "mode", ("dds", "operator112"), None)
    format_ = read_one_of(params, "format", ("training", "exam"), None)
    page, per_page = read_page(params)
    items = [item for item in await analytics.rows(db, viewer.user_id) if (mode is None or item["mode"] == mode) and (format_ is None or item["format"] == format_)]
    public = [HistoryItem.model_validate(item).dump() for item in items[(page - 1) * per_page:page * per_page]]
    return page_response(public, len(items), page, per_page)


@router.get("/me/analytics", response_model=Analytics)
async def my_analytics(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    requested = read_string(request.query_params, "studentId")
    if requested and requested != viewer.user_id:
        raise forbidden("Доступна только собственная аналитика")
    return analytics.summarize(await analytics.rows(db, viewer.user_id))


@router.get("/kb/articles", response_model=list[KbArticle], response_model_exclude_none=True)
async def list_articles(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    group = read_string(request.query_params, "group")
    query = read_string(request.query_params, "q")
    articles = (await db.execute(select(KbArticleRow).order_by(KbArticleRow.group))).scalars().all()
    if group:
        articles = [item for item in articles if group.casefold() in item.group.casefold()]
    if query:
        needle = query.casefold()
        articles = [item for item in articles if needle in item.title.casefold() or needle in item.group.casefold()]
    return [item.to_contract() for item in articles]


@router.get("/kb/articles/{article_id}", response_model=KbArticle, response_model_exclude_none=True)
async def get_article(article_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    item = await db.get(KbArticleRow, article_id)
    if item is None:
        raise not_found("Статья не найдена")
    return item.to_contract()


@router.patch("/kb/articles/{article_id}", response_model=KbArticle, response_model_exclude_none=True)
async def patch_article(article_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(teacher_or_admin)) -> dict[str, Any]:
    item = await db.get(KbArticleRow, article_id)
    if item is None:
        raise not_found("Статья не найдена")
    body = await read_body(request)
    if set(body) != {"sections"}:
        raise validation_failed("Допускается изменение только разделов статьи")
    patch = parse_body(KbArticlePatch, body)
    item.sections = patch.sections.dump()
    item.updated_by = viewer.user_id
    item.updated_at = now_iso()
    await audit.record(db, action="kb.update", user_id=viewer.user_id, role=viewer.role, details=f"Статья {article_id}")
    await db.commit()
    return item.to_contract()
