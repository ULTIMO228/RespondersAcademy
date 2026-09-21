"""Билеты и аудио (`contracts/v1-endpoints.md`, «Билеты и аудио»; T084/T085):
`GET /tickets`, `POST /tickets`, `POST|GET /tickets/{id}/audio`, `GET /tickets/{id}/audio/file`.
`POST /tickets/{id}/validate` — Phase 11 (T087).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_viewer
from app.api.errors import forbidden, not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.db.session import get_db
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.models.ticket_audio import TicketAudio
from app.schemas.scenarios import parse_body
from app.schemas.v1.operator112 import TicketAudioRequest, TicketCreate
from app.services import operator112_service, ticket_audio_service
from app.services.reference import read_reference
from ml.classify import notification_list as nl

router = APIRouter()
TEACHER_ONLY = "Действие доступно преподавателю и администратору"


def _list_param(request: Request, *names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        values.extend(v.strip() for v in request.query_params.getlist(name) if v.strip())
    return values


async def _scenario_index(db: AsyncSession) -> dict[str, list[Scenario]]:
    rows = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    index: dict[str, list[Scenario]] = {}
    for row in rows:
        for card_id in row.card_ids or []:
            index.setdefault(card_id, []).append(row)
    return index


def ticket_contract(card: IncidentCard, scenarios: list[Scenario], audio: TicketAudio | None) -> dict[str, Any]:
    """Ticket = IncidentCard + { audio?, validation?, difficulty, approved }."""
    data = card.to_contract()
    extra = card.extra or {}
    difficulty = max((s.difficulty for s in scenarios), default=int(extra.get("difficulty") or 1))
    approved = any(s.validation_status == "approved" for s in scenarios) or (card.mode_origin == "seed" and not scenarios)
    data["difficulty"] = int(difficulty)
    data["approved"] = bool(approved)
    data["modeOrigin"] = card.mode_origin
    summary = ticket_audio_service.audio_summary(audio)
    if summary is not None:
        data["audio"] = summary
    reports = [s.validation_report for s in scenarios if s.validation_report]
    if reports:
        data["validation"] = reports[0]
    return data


@router.get("/tickets")
async def list_tickets(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    groups = {nl.norm(g) for g in _list_param(request, "group", "group[]")}
    difficulties = {int(d) for d in _list_param(request, "difficulty", "difficulty[]") if d.isdigit()}
    source = (request.query_params.get("source") or "").strip()
    status = (request.query_params.get("validationStatus") or "").strip()
    query = nl.norm(request.query_params.get("q") or "")
    cards = (await db.execute(select(IncidentCard).order_by(IncidentCard.id))).scalars().all()
    audio_rows = {row.card_id: row for row in (await db.execute(select(TicketAudio))).scalars().all()}
    scenarios = await _scenario_index(db)
    items: list[dict[str, Any]] = []
    for card in cards:
        own = scenarios.get(card.id, [])
        if source and card.mode_origin != source:
            continue
        if status and status != ("approved" if any(s.validation_status == "approved" for s in own) or (card.mode_origin == "seed" and not own) else "pending"):
            continue
        item = ticket_contract(card, own, audio_rows.get(card.id))
        if groups and nl.norm(card.group) not in groups:
            continue
        if difficulties and item["difficulty"] not in difficulties:
            continue
        if query and query not in nl.norm(f"{card.id} {card.ticket_no} {card.group} {card.summary} {card.address}"):
            continue
        items.append(item)
    return items


def _require_teacher(viewer: Viewer) -> None:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden(TEACHER_ONLY)


@router.post("/tickets", status_code=201)
async def create_ticket(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> JSONResponse:
    """Ручное создание билета преподавателем: эталон достраивается по группе через классификатор; грамматика проверяется."""
    _require_teacher(viewer)
    body: TicketCreate = parse_body(TicketCreate, await read_body(request))
    reference = await read_reference(db)
    groups = {nl.norm(g): str(g) for g in reference.get("incidentGroups") or []}
    group = groups.get(nl.norm(body.group))
    if group is None:
        raise validation_failed(f"Группа «{body.group}» отсутствует в справочнике групп ЕКП")
    grammar = get_gateway().check_grammar(body.summary, "summary")
    entries = await operator112_service.classifier_entries(db)
    expected_services = list(body.expected_services)
    expected_tags = list(body.expected_tags)
    if not expected_services or not expected_tags:
        chosen = nl.build(entries, reference, signs=expected_tags, group=group, flags=["Пострадавшие"] if body.victims else [])
        if chosen.entry is None:
            chosen = nl.build(entries, reference, signs=[group], group=group)
        if not expected_services:
            expected_services = [s.service_id.removeprefix("svc-") if s.service_id[:7] in ("svc-101", "svc-102", "svc-103", "svc-104") else s.title for s in chosen.services[:3]]
        if not expected_tags and chosen.entry is not None:
            expected_tags = nl.entry_signs(chosen.entry)
    card = IncidentCard(
        id=await next_id(db, PREFIX["card"], IncidentCard.id),
        ticket_no=max([c for c in (await db.execute(select(IncidentCard.ticket_no))).scalars().all() if isinstance(c, int)], default=0) + 1,
        situation_no=0,
        group=group,
        summary=body.summary,
        address=body.address,
        address_refined=body.address_refined,
        caller=body.caller,
        victims=body.victims,
        no_ambulance=body.no_ambulance,
        cross_region=body.cross_region,
        expected_services=expected_services,
        expected_tags=expected_tags,
        mode_origin="manual",
        extra={"difficulty": body.difficulty, "createdBy": viewer.user_id, "grammarErrors": grammar},
    )
    db.add(card)
    await db.flush()
    await db.commit()
    return JSONResponse(ticket_contract(card, [], None), status_code=201)


async def _require_ticket(db: AsyncSession, card_id: str) -> IncidentCard:
    card = await db.get(IncidentCard, card_id)
    if card is None:
        raise not_found(f"Билет «{card_id}» не найден")
    return card


@router.post("/tickets/{card_id}/audio", status_code=202)
async def request_audio(card_id: str, request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> JSONResponse:
    """Запуск (пере)генерации записи; 202 + текущий `TicketAudio`, готовность — опросом `GET /tickets/{id}/audio`."""
    _require_teacher(viewer)
    card = await _require_ticket(db, card_id)
    raw = await request.body()
    body: TicketAudioRequest = parse_body(TicketAudioRequest, await read_body(request)) if raw.strip() else TicketAudioRequest()
    row, needs = await ticket_audio_service.ensure_audio(db, card, body.voice, regenerate=True)
    await db.commit()
    if needs:
        ticket_audio_service.schedule_synthesis([card.id], background)
    return JSONResponse(row.to_contract(), status_code=202)


@router.get("/tickets/{card_id}/audio")
async def get_audio(card_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    await _require_ticket(db, card_id)
    row = await db.get(TicketAudio, card_id)
    return ticket_audio_service.audio_contract(row, card_id)


@router.get("/tickets/{card_id}/audio/file")
async def get_audio_file(card_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> FileResponse:
    await _require_ticket(db, card_id)
    row = await db.get(TicketAudio, card_id)
    if row is None or row.status != "ready" or not row.path or not Path(row.path).exists():
        raise not_found("Аудиозапись не готова: используйте расшифровку (аварийный режим)")
    await operator112_service.audio_access(db, card_id, viewer)
    await db.commit()
    return FileResponse(row.path, media_type="audio/wav", filename=f"{card_id}.wav", headers={"Cache-Control": "no-store"})
