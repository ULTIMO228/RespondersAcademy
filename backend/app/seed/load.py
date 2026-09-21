"""Идемпотентная загрузка сидов фронта (spec/mocks, mocks/local, mocks/admin) в БД.

Запуск: `python -m app.seed.load [--reset]`. Повторный запуск ничего не дублирует (upsert по id).
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import Base
from app.db.session import get_engine, get_sessionmaker, init_db
from app.models import (
    Address,
    ArmCardFixture,
    Attempt,
    AuditLog,
    CardRuntime,
    ClassifierEntry,
    Evaluation,
    GroupReport,
    IncidentCard,
    ProfileMappingRow,
    ReferenceEntry,
    Report,
    Scenario,
    SystemLog,
    SystemService,
    SystemSettings,
    SystemStatic,
    TrainingSession,
    User,
)
from app.seed.profile_mapping_seed import PROFILE_MAPPING_SEED
from app.services.security import hash_password
from app.services.time import now_iso

REFERENCE_KEYS = (
    "ddsStatuses",
    "serviceStatuses",
    "callerStatuses",
    "channels",
    "services",
    "incidentGroups",
    "cardStatuses",
    "districts",
    "sources",
    "internalNumbers",
)

INCIDENT_CARD_FIELDS = {
    "id",
    "ticketNo",
    "situationNo",
    "group",
    "summary",
    "address",
    "addressRefined",
    "caller",
    "victims",
    "noAmbulance",
    "crossRegion",
    "expectedServices",
    "expectedTags",
    "duplicateOf",
    "createdByStudentId",
}


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


class SeedPaths:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.mocks = root / "spec" / "mocks"
        self.local = root / "mocks" / "local"
        self.admin = root / "mocks" / "admin"

    def spec(self, name: str) -> Path:
        return self.mocks / name


async def _upsert(db: AsyncSession, model, key: str, values: dict[str, Any]) -> None:
    existing = await db.get(model, values[key])
    if existing is None:
        db.add(model(**values))
        return
    for field, value in values.items():
        if field != key:
            setattr(existing, field, value)


async def seed_users(db: AsyncSession, paths: SeedPaths) -> int:
    users = read_json(paths.spec("users.json"))["users"]
    for user in users:
        await _upsert(
            db,
            User,
            "id",
            {
                "id": user["id"],
                "login": user["login"],
                "password_hash": hash_password(user["password"]),
                "full_name": user["fullName"],
                "role": user["role"],
                "arm_number": int(user["armNumber"]),
                "is_active": bool(user.get("isActive", True)),
                "group": user.get("group"),
                "service": user.get("service"),
                "assigned_groups": user.get("assignedGroups"),
            },
        )
    return len(users)


async def seed_reference(db: AsyncSession, paths: SeedPaths) -> int:
    reference = read_json(paths.spec("reference.json"))
    classifier = read_json(paths.spec("classifier.json"))
    for key in REFERENCE_KEYS:
        await _upsert(db, ReferenceEntry, "key", {"key": key, "value": reference[key]})
    await _upsert(db, ReferenceEntry, "key", {"key": "classifierRows", "value": reference.get("classifierRows")})
    await _upsert(db, ReferenceEntry, "key", {"key": "classifierMeta", "value": classifier.get("meta", {})})
    return len(REFERENCE_KEYS)


async def seed_classifier(db: AsyncSession, paths: SeedPaths) -> int:
    entries = read_json(paths.spec("classifier.json"))["entries"]
    existing = {row for row in (await db.execute(select(ClassifierEntry.code))).scalars().all()}
    for entry in entries:
        values = {
            "code": entry["code"],
            "group": entry["group"],
            "sign1": entry.get("sign1", ""),
            "sign2": entry.get("sign2", ""),
            "sign3": entry.get("sign3", ""),
            "extra_signs": entry.get("extraSigns", ""),
            "final_type": entry.get("finalType", ""),
            "ekp35_type": entry.get("ekp35Type", ""),
            "main_service": entry.get("mainService", "") or "",
            "notifications": entry.get("notifications", []),
        }
        if entry["code"] in existing:
            await _upsert(db, ClassifierEntry, "code", values)
        else:
            db.add(ClassifierEntry(**values))
    return len(entries)


async def seed_cards(db: AsyncSession, paths: SeedPaths) -> int:
    cards = read_json(paths.spec("cards.json"))["cards"]
    for card in cards:
        extra = {k: v for k, v in card.items() if k not in INCIDENT_CARD_FIELDS}
        await _upsert(
            db,
            IncidentCard,
            "id",
            {
                "id": card["id"],
                "ticket_no": int(card["ticketNo"]),
                "situation_no": int(card["situationNo"]),
                "group": card["group"],
                "summary": card["summary"],
                "address": card["address"],
                "address_refined": card.get("addressRefined"),
                "caller": card["caller"],
                "victims": card.get("victims"),
                "no_ambulance": card.get("noAmbulance"),
                "cross_region": card.get("crossRegion"),
                "expected_services": card.get("expectedServices", []),
                "expected_tags": card.get("expectedTags", []),
                "duplicate_of": card.get("duplicateOf"),
                "created_by_student_id": card.get("createdByStudentId"),
                "mode_origin": "seed",
                "extra": extra or None,
            },
        )
    return len(cards)


async def seed_fixtures(db: AsyncSession, paths: SeedPaths) -> int:
    fixtures = read_json(paths.spec("fixtures") / "arm-cards.json")["cards"]
    for seq, fixture in enumerate(fixtures):
        await _upsert(
            db,
            ArmCardFixture,
            "id",
            {
                "id": fixture["id"],
                "number": int(fixture["number"]),
                "seq": seq,
                "created_at": fixture["createdAt"],
                "card_status": fixture["cardStatus"],
                "classifier_code": (fixture.get("what") or {}).get("classifierCode"),
                "doc": fixture,
            },
        )
        # Входящие SMS фикстуры — стартовая переписка карточки (store-seed.ts → seedFixtureSms).
        sms_list = fixture.get("smsList") or []
        if sms_list and await db.get(CardRuntime, fixture["id"]) is None:
            db.add(
                CardRuntime(
                    card_id=fixture["id"],
                    sms=[
                        {
                            "id": f"sms-{fixture['id']}-{index + 1}",
                            "cardId": fixture["id"],
                            "direction": "incoming",
                            "text": text,
                            "at": fixture["createdAt"],
                            "phone": fixture["phones"]["aon"],
                        }
                        for index, text in enumerate(sms_list)
                    ],
                )
            )
    return len(fixtures)


async def seed_scenarios(db: AsyncSession, paths: SeedPaths) -> int:
    scenarios = read_json(paths.spec("scenarios.json"))["scenarios"]
    for doc in scenarios:
        row = await db.get(Scenario, doc["id"])
        if row is None:
            row = Scenario(id=doc["id"], doc=doc, title="", level="", difficulty=1, source="", validation_status="")
            db.add(row)
        else:
            row.doc = doc
        row.sync_columns()
    return len(scenarios)


async def seed_sessions(db: AsyncSession, paths: SeedPaths) -> int:
    sessions = read_json(paths.spec("sessions.json"))["sessions"]
    for doc in sessions:
        await _upsert(
            db,
            TrainingSession,
            "id",
            {
                "id": doc["id"],
                "teacher_id": doc["teacherId"],
                "student_ids": doc.get("studentIds", []),
                "scenario_ids": doc.get("scenarioIds", []),
                "mode": doc.get("mode", "practice"),
                "card_source": doc.get("cardSource", "generated"),
                "card_flow": doc.get("cardFlow", []),
                "state": doc.get("state", "configured"),
                "started_at": doc.get("startedAt") or now_iso(),
                "finished_at": doc.get("finishedAt"),
            },
        )
        for seq, event in enumerate(doc.get("cardEvents", [])):
            await _upsert(
                db,
                Attempt,
                "id",
                {
                    "id": event["id"],
                    "session_id": doc["id"],
                    "card_id": event["cardId"],
                    "student_id": event["studentId"],
                    "opened_at": event["openedAt"],
                    "primary_reaction_ms": int(event.get("primaryReactionMs", 0)),
                    "statuses": event.get("statuses", []),
                    "services_called": event.get("servicesCalled", []),
                    "completed_at": event.get("completedAt") or None,
                    "full_processing_ms": int(event.get("fullProcessingMs", 0)),
                    "entered_text": event.get("enteredText", {}),
                    "calls": event.get("calls", []),
                    "seq": seq,
                },
            )
            evaluation = event.get("evaluation")
            if evaluation:
                await _upsert(
                    db,
                    Evaluation,
                    "attempt_id",
                    {
                        "attempt_id": event["id"],
                        "assessor_version": "seed",
                        "time_score": int(evaluation["timeScore"]),
                        "correctness_score": int(evaluation["correctnessScore"]),
                        "grammar_score": int(evaluation["grammarScore"]),
                        "semantic_score": int(evaluation["semanticScore"]),
                        "total_score": int(evaluation["totalScore"]),
                        "grammar_errors": evaluation.get("grammarErrors", []),
                        "errors": evaluation.get("errors", []),
                        "ai_comment": evaluation.get("aiComment", ""),
                        "components": None,
                        "generated_at": event.get("completedAt") or event["openedAt"],
                    },
                )
    return len(sessions)


async def seed_reports(db: AsyncSession, paths: SeedPaths) -> int:
    """reports.json → статические отчёты (static=True): никогда не пересобираются (docs/mock-api.md)."""
    path = paths.spec("reports.json")
    if not path.exists():
        return 0
    data = read_json(path)
    reports = data.get("reports", [])
    for doc in reports:
        await _upsert(
            db,
            Report,
            "id",
            {
                "id": doc["id"],
                "session_id": doc["sessionId"],
                "student_id": doc["student"]["studentId"],
                "generated_at": doc["generatedAt"],
                "export_formats": doc.get("exportFormats", ["csv", "pdf"]),
                "student": doc["student"],
                "time_metrics": doc.get("timeMetrics", []),
                "grammar_errors": doc.get("grammarErrors", []),
                "errors": doc.get("errors", []),
                "score": int(doc.get("score", 0)),
                "charts": doc.get("charts", {}),
                "ai_comment": doc.get("aiComment"),
                "static": True,
            },
        )
    group = data.get("groupReport")
    if group:
        await _upsert(
            db,
            GroupReport,
            "id",
            {
                "id": group["id"],
                "session_id": group["sessionId"],
                "generated_at": group["generatedAt"],
                "report_ids": group.get("reportIds") or [r["id"] for r in reports if r["sessionId"] == group["sessionId"]],
                "group_insights": group.get("groupInsights", []),
                "charts": group.get("charts", {}),
                "static": True,
            },
        )
    return len(reports)


async def seed_addresses(db: AsyncSession, paths: SeedPaths) -> int:
    path = paths.local / "addresses.json"
    if not path.exists():
        return 0
    addresses = read_json(path)["addresses"]
    for address in addresses:
        await _upsert(db, Address, "id", {"id": address["id"], "doc": address})
    return len(addresses)


async def seed_admin(db: AsyncSession, paths: SeedPaths) -> dict[str, int]:
    counts: dict[str, int] = {}
    audit_path = paths.admin / "audit-log.json"
    if audit_path.exists():
        entries = read_json(audit_path)["auditLog"]
        for entry in entries:
            await _upsert(
                db,
                AuditLog,
                "id",
                {
                    "id": entry["id"],
                    "at": entry["at"],
                    "user_id": entry.get("userId"),
                    "role": entry.get("role", "admin"),
                    "action": entry["action"],
                    "details": entry.get("details", ""),
                    "ip": entry.get("ip"),
                    "card_id": entry.get("cardId"),
                    "operator_arm": entry.get("operatorArm"),
                },
            )
        counts["auditLog"] = len(entries)
    settings_path = paths.admin / "system-settings.json"
    if settings_path.exists():
        settings = read_json(settings_path)["settings"]
        await _upsert(db, SystemSettings, "id", {"id": 1, "settings": settings})
        counts["systemSettings"] = 1
    services_path = paths.admin / "system-services.json"
    if services_path.exists():
        doc = read_json(services_path)
        for seq, service in enumerate(doc["services"]):
            await _upsert(
                db,
                SystemService,
                "id",
                {
                    "id": service["id"],
                    "name": service["name"],
                    "state": service.get("state", "running"),
                    "uptime_sec": int(service.get("uptimeSec", 0)),
                    "critical": bool(service.get("critical", False)),
                    "description": service.get("description", ""),
                    "started_at": None,
                    "seq": seq,
                },
            )
        counts["systemServices"] = len(doc["services"])
        if doc.get("integrity"):
            await _upsert(db, SystemStatic, "key", {"key": "integrity", "value": doc["integrity"]})
    logs_path = paths.admin / "system-logs.json"
    if logs_path.exists():
        logs = read_json(logs_path)["logs"]
        for entry in logs:
            await _upsert(db, SystemLog, "id", {"id": entry["id"], "at": entry["at"], "level": entry["level"], "source": entry["source"], "message": entry["message"]})
        counts["systemLogs"] = len(logs)
    for key, name in (("monitoring", "monitoring.json"), ("usageStats", "usage-stats.json")):
        path = paths.admin / name
        if path.exists():
            await _upsert(db, SystemStatic, "key", {"key": key, "value": read_json(path)})
            counts[key] = 1
    return counts


async def seed_profile_mapping(db: AsyncSession) -> int:
    for values in PROFILE_MAPPING_SEED:
        await _upsert(db, ProfileMappingRow, "id", values)
    return len(PROFILE_MAPPING_SEED)


async def reset_all() -> None:
    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)


async def run_seed(seed_dir: Path | None = None, reset: bool = False) -> dict[str, int]:
    settings = get_settings()
    paths = SeedPaths(seed_dir or settings.seed_dir)
    if reset:
        await reset_all()
    else:
        await init_db()
    async with get_sessionmaker()() as db:
        summary: dict[str, int] = {}
        summary["users"] = await seed_users(db, paths)
        summary["profileMapping"] = await seed_profile_mapping(db)
        summary["reference"] = await seed_reference(db, paths)
        summary["classifier"] = await seed_classifier(db, paths)
        summary["incidentCards"] = await seed_cards(db, paths)
        summary["armCardFixtures"] = await seed_fixtures(db, paths)
        summary["scenarios"] = await seed_scenarios(db, paths)
        summary["sessions"] = await seed_sessions(db, paths)
        summary["reports"] = await seed_reports(db, paths)
        summary["addresses"] = await seed_addresses(db, paths)
        summary.update(await seed_admin(db, paths))
        await db.commit()
        return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Загрузка сидов мок-слоя в БД")
    parser.add_argument("--reset", action="store_true", help="пересоздать схему и загрузить заново")
    parser.add_argument("--seed-dir", type=Path, default=None, help="корень репозитория с сидами")
    args = parser.parse_args()
    summary = asyncio.run(run_seed(args.seed_dir, reset=args.reset))
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
