"""GET /reference, GET /classifier — справочники и классификатор ЕКП."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.classifier import ClassifierEntry
from app.schemas.common import read_string
from app.services.reference import read_classifier_meta, read_reference

router = APIRouter()


@router.get("/reference")
async def get_reference(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await read_reference(db)


@router.get("/classifier")
async def get_classifier(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    group = read_string(request.query_params, "group")
    code = read_string(request.query_params, "code")
    query = select(ClassifierEntry)
    if code:
        entry = await db.get(ClassifierEntry, code)
        if entry is None:
            rows: list[ClassifierEntry] = []
        else:
            rows = list((await db.execute(select(ClassifierEntry).where(ClassifierEntry.group == entry.group))).scalars().all())
    elif group:
        rows = list((await db.execute(query.where(ClassifierEntry.group == group))).scalars().all())
    else:
        rows = list((await db.execute(query)).scalars().all())
    rows.sort(key=lambda row: row.code)
    meta = await read_classifier_meta(db)
    version = str(meta.get("version", ""))
    response.headers["X-Classifier-Version"] = quote(version, safe="")
    return [row.to_contract() for row in rows]
