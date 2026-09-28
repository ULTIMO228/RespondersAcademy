"""Юнит-тесты реестра ошибок: канонический ID, дедупликация, матрица правил двух режимов и сведение (T027)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.ai_assessment import ErrorRecord
from app.services.ai_error_registry import (
    add_teacher_error,
    canonical_error_id,
    get_session_error_summary,
    save_error_records,
)
from ml.assess.adapter import to_error_records
from ml.assess.rules import RULES
from ml.assess.types import AssessError, AssessmentResult, ComponentResult


def test_canonical_error_id_deterministic():
    """ID ошибки строго детерминирован и зависит только от канонического кортежа ключей."""
    id1 = canonical_error_id(
        attempt_id="att-001",
        rule_id="v1",
        evidence_key="rule:v1",
        etalon_version="etalon-v1",
    )
    id2 = canonical_error_id(
        attempt_id="att-001",
        rule_id="v1",
        evidence_key="rule:v1",
        etalon_version="etalon-v1",
    )
    assert id1 == id2
    assert id1.startswith("err-")
    assert len(id1) <= 64

    # Изменение любого компонента ключа дает другой ID
    id_diff_attempt = canonical_error_id("att-002", "v1", "rule:v1", "etalon-v1")
    id_diff_rule = canonical_error_id("att-001", "v2", "rule:v1", "etalon-v1")
    id_diff_evidence = canonical_error_id("att-001", "v1", "field:status", "etalon-v1")
    id_diff_etalon = canonical_error_id("att-001", "v1", "rule:v1", "etalon-v2")

    assert len({id1, id_diff_attempt, id_diff_rule, id_diff_evidence, id_diff_etalon}) == 5


def test_operator112_rules_matrix_coverage():
    """Проверка полного покрытия правил режима operator112 и валидности их severity."""
    op_rules = [r for r in RULES.values() if r.id.startswith("op-")]
    assert len(op_rules) >= 16

    expected_rules = {
        "op-t0", "op-t1", "op-t2", "op-t3",  # тайминги
        "op-f0", "op-f1", "op-f2",          # итоговый тип, служба
        "op-s1", "op-s2", "op-s3",          # признаки и флаги
        "op-d0", "op-d1",                   # описание и факты
        "op-a1", "op-a2", "op-a3", "op-a4", "op-a5",  # заявитель, телефон, адрес
    }
    present_rule_ids = {r.id for r in op_rules}
    assert expected_rules.issubset(present_rule_ids)

    for rule in op_rules:
        assert rule.severity in ("critical", "major", "minor")
        assert rule.source != ""
        err = rule.error(actual="Тест", expected="Эталон", fact=10, norm=30, missing="", services="101")
        assert isinstance(err, AssessError)
        assert err.rule_id == rule.id
        assert err.severity == rule.severity


def test_dds_rules_matrix_coverage():
    """Проверка полного покрытия правил режима dds (7 нарушений ОКР, тайминги, статусы, доклады)."""
    dds_critical_rules = {"v1", "v2", "v2t", "v3", "v4", "d1", "a3"}
    for rule_id in dds_critical_rules:
        assert rule_id in RULES
        assert RULES[rule_id].severity == "critical"

    dds_major_rules = {"v5", "v6", "v7", "t1", "t2", "t3", "d2", "d3", "d4", "s1", "s3", "f1", "g1", "a1", "a4", "m1"}
    for rule_id in dds_major_rules:
        assert rule_id in RULES
        assert RULES[rule_id].severity == "major"

    dds_minor_rules = {"v6c", "s2", "c1", "c2", "a2", "x1"}
    for rule_id in dds_minor_rules:
        assert rule_id in RULES
        assert RULES[rule_id].severity == "minor"


def test_to_error_records_conversion_and_uncertain_protection():
    """Проверка конвертации AssessError в строгие ErrorRecord и исключения неопределённости LLM."""
    err1 = RULES["op-t0"].error(fact=45, norm=30)
    err2 = RULES["v1"].error()

    comp_res = ComponentResult(
        name="timing",
        score=0.5,
        errors=[err1, err2],
        details={"disputeDecision": "uncertain"},  # Неопределенность семантики
    )
    result = AssessmentResult(
        mode="dds",
        version="assessor-1.0",
        components={"timing": comp_res},
        weights={"timing": 1.0},
        grammar_errors=[],
        total=0.5,
    )

    records = to_error_records(
        result=result,
        attempt_id="att-test-conv",
        etalon_version="scen-v1",
        assessor_version="assessor-1.0",
        mode="dds",
    )

    assert len(records) == 2
    # Никакой записи для 'uncertain' не создано
    assert all(r["rule_id"] != "uncertain" for r in records)
    assert all(r["severity"] in ("critical", "major", "minor") for r in records)
    assert all(r["detector"] in ("rule", "ml", "llm_confirmed", "teacher") for r in records)
    assert all(r["source_ref"] != "" for r in records)
    assert all(r["evidence_key"] != "" for r in records)


@pytest.mark.asyncio
async def test_save_error_records_idempotent_deduplication(seeded_db):
    """Повторное сохранение той же ошибки идемпотентно и не приводит к дублям (T029)."""
    async with get_sessionmaker()() as db:
        record = {
            "attempt_id": "att-idemp-1",
            "mode": "dds",
            "rule_id": "v1",
            "type": "noPrimaryStatus",
            "severity": "critical",
            "evidence_key": "rule:v1",
            "field_path": "statuses",
            "event_id": None,
            "observed": "Статус реагирования не выставлен",
            "expected": "Принята / Не принята",
            "source_ref": "памятка ОКР ГСИ",
            "detector": "rule",
            "etalon_version": "scen-001",
            "assessor_version": "1.0",
            "fixed": False,
        }

        # Первое сохранение
        saved1 = await save_error_records(db, [record])
        assert len(saved1) == 1
        record_id = saved1[0].id

        # Повторное сохранение идентичной записи
        saved2 = await save_error_records(db, [record])
        assert len(saved2) == 1
        assert saved2[0].id == record_id

        # Проверяем в базе: ровно одна запись
        stmt = select(ErrorRecord).where(ErrorRecord.attempt_id == "att-idemp-1")
        all_records = (await db.execute(stmt)).scalars().all()
        assert len(all_records) == 1


@pytest.mark.asyncio
async def test_detector_merge_rule_and_llm(seeded_db):
    """Совпадение правила и подтверждения модели объединяется в llm_confirmed (T029)."""
    async with get_sessionmaker()() as db:
        base_record = {
            "attempt_id": "att-merge-1",
            "mode": "dds",
            "rule_id": "d1",
            "type": "missedRequiredCall",
            "severity": "critical",
            "evidence_key": "call:point_c",
            "field_path": "calls",
            "event_id": None,
            "observed": "Звонок точке C не выполнен",
            "expected": "Звонок в ЦУКС",
            "source_ref": "ЕКП",
            "detector": "rule",
            "etalon_version": "scen-001",
            "assessor_version": "1.0",
            "fixed": False,
        }

        # Сохраняем исходное правило
        await save_error_records(db, [base_record])

        # Приходит подтверждение от LLM/модели
        llm_record = dict(base_record)
        llm_record["detector"] = "ml"

        merged = await save_error_records(db, [llm_record])
        assert len(merged) == 1
        assert merged[0].detector == "llm_confirmed"


@pytest.mark.asyncio
async def test_add_teacher_error_preserves_teacher_id(seeded_db):
    """Ручная ошибка преподавателя сохраняет detector='teacher' и teacher_id (T029)."""
    async with get_sessionmaker()() as db:
        teacher_rec = await add_teacher_error(
            db=db,
            attempt_id="att-teacher-1",
            teacher_id="u-002",
            payload={
                "mode": "dds",
                "rule_id": "manual-01",
                "type": "wrongDecision",
                "severity": "major",
                "evidence_key": "teacher:note-1",
                "field_path": "comment",
                "observed": "Неверно указана причина задержки",
                "expected": "Точное описание задержки",
                "source_ref": "Замечание преподавателя",
                "etalon_version": "scen-001",
                "assessor_version": "manual",
            },
        )
        assert teacher_rec.detector == "teacher"
        assert teacher_rec.teacher_id == "u-002"
        assert teacher_rec.severity == "major"


@pytest.mark.asyncio
async def test_error_summary_calculation_and_empty_session_zeros(seeded_db):
    """Сводка ошибок рассчитывается воспроизводимо; пустая сессия возвращает честные нули (T031)."""
    async with get_sessionmaker()() as db:
        # 1. Пустая сессия без попыток
        empty_summary = await get_session_error_summary(db, session_id="session-empty-999")
        assert empty_summary["total_errors"] == 0
        assert empty_summary["by_type"] == {}
        assert empty_summary["by_mode"] == {"operator112": 0, "dds": 0}
        assert empty_summary["by_severity"] == {"critical": 0, "major": 0, "minor": 0}
        assert empty_summary["by_student"] == {}
        assert empty_summary["error_record_ids"] == []
