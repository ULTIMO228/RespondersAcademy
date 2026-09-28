"""Юнит-тесты калибровки семантики, разрешения споров и AI-шлюза (US2, T018, T020, T021)."""

from __future__ import annotations

from app.ai_gateway import LocalAiGateway
from ml.assess.components.semantic import (
    CALIBRATED_VERSION,
    DISPUTE_HIGH_THRESHOLD,
    DISPUTE_LOW_THRESHOLD,
    classify_similarity,
    evaluate_semantic_field,
)


def test_similarity_calibration_boundaries():
    """Проверка калиброванных границ семантического подобия (T020)."""
    assert CALIBRATED_VERSION == "semantic-calibrated-v1"
    assert DISPUTE_LOW_THRESHOLD == 0.65
    assert DISPUTE_HIGH_THRESHOLD == 0.82

    # Очевидный эквивалент
    assert classify_similarity(0.85) == "equivalent"
    # Очевидное расхождение
    assert classify_similarity(0.50) == "different"
    # Спорная зона (требует арбитража / второго эшелона)
    assert classify_similarity(0.74) == "dispute"


def test_evaluate_semantic_field_equivalent():
    """Смысловое поле с высокой близостью признается эквивалентным без арбитража."""
    res = evaluate_semantic_field(
        actual_text="Возгорание мусора на открытой площадке, открытого огня нет",
        reference_facts=["горит мусор", "пострадавших нет"],
        similarity=0.88,
    )
    assert res.decision == "equivalent"
    assert res.requires_review is False
    assert res.score == 1.0


def test_evaluate_semantic_field_dispute_requires_review():
    """Пограничное значение в спорной зоне требует второго эшелона или ручной проверки."""
    res = evaluate_semantic_field(
        actual_text="Запах гари в подъезде, источника не видно",
        reference_facts=["задымление на 3 этаже", "запах гари"],
        similarity=0.72,
    )
    assert res.decision == "uncertain"
    assert res.requires_review is True
    assert res.score is None


def test_resolve_semantic_dispute_contract_compliance():
    """Порт resolve_semantic_dispute возвращает строгий контракт по схеме (T021)."""
    gateway = LocalAiGateway()
    input_facts = ["fact-1", "fact-2"]
    res = gateway.resolve_semantic_dispute(
        text="Служба 112 передала карточку в пожарную охрану",
        reference_fact_ids=input_facts,
        mode="operator112",
        reason="Спорный факт оповещения",
        versions={"assessorVersion": "operator112-1.0.0", "thresholdVersion": CALIBRATED_VERSION},
    )

    assert res["decision"] in ("equivalent", "different", "uncertain")
    assert isinstance(res["referenceFactIds"], list)
    # Все возвращенные factId строго подмножество входных!
    for fid in res["referenceFactIds"]:
        assert fid in input_facts
    assert isinstance(res["explanation"], str)
    assert 1 <= len(res["explanation"]) <= 500


def test_resolve_semantic_dispute_fallback_on_invalid():
    """При невалидном вводе или ошибке возвращается безопасный uncertain (T021)."""
    gateway = LocalAiGateway()
    # Пустой текст или пустые факты
    res = gateway.resolve_semantic_dispute(
        text="",
        reference_fact_ids=[],
        mode="dds",
        reason="",
        versions={},
    )
    assert res["decision"] == "uncertain"
    assert "проверк" in res["explanation"].lower() or "ошибк" in res["explanation"].lower()
