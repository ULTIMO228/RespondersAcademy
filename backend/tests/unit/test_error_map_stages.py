"""T007: полнота карты этапов относительно реестра оценщика (`ml.assess.rules`).

Каждое правило реестра отнесено ровно к одному этапу или явно к «Прочее»; у каждого есть простая
формулировка не длиннее 90 символов; порядок этапов без пропусков; связи идут только вперёд.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from app.services import error_map_stages as stages
from ml.assess.rules import RULES

KB_DIR = Path(__file__).resolve().parents[2] / "data" / "kb"
OPERATOR_PREFIX = "op-"
# Правила режима специалиста-112, которые по §3 стоят в «Прочем», хотя не имеют префикса op-.
OPERATOR_SHARED_TO_OTHER = {"g1", "f1", "c1"}

OPERATOR_RULES = {rid for rid in RULES if rid.startswith(OPERATOR_PREFIX)}
NON_OPERATOR_RULES = {rid for rid in RULES if not rid.startswith(OPERATOR_PREFIX)}
# Адресные правила a1–a3 оценщик выдаёт и в режиме специалиста-112 → этап «Место» (решение владельца D8).
OPERATOR_ADDRESS_RULES = {"a1", "a2", "a3"}


def _listed(mode: str) -> list[str]:
    return [rule_id for _, rule_ids in stages.LAYOUT[mode] for rule_id in rule_ids]


# ─── Полнота раскладки ──────────────────────────────────────────────────────────────────────────


def test_dds_layout_lists_every_non_operator_rule_exactly_once():
    listed = _listed("dds")
    assert all(count == 1 for count in Counter(listed).values()), Counter(listed)
    assert set(listed) == NON_OPERATOR_RULES


def test_operator112_layout_lists_every_operator_rule_exactly_once():
    listed = _listed("operator112")
    assert all(count == 1 for count in Counter(listed).values()), Counter(listed)
    assert set(listed) == OPERATOR_RULES | OPERATOR_SHARED_TO_OTHER | OPERATOR_ADDRESS_RULES


def test_layout_rule_ids_exist_in_registry():
    for mode in stages.MODES:
        unknown = set(_listed(mode)) - set(RULES)
        assert not unknown, (mode, unknown)


@pytest.mark.parametrize("mode", stages.MODES)
def test_every_registry_rule_resolves_to_a_stage_of_its_mode(mode: str):
    for rule_id in RULES:
        stage = stages.stage_for_rule(mode, rule_id)
        assert stage.mode == mode, (mode, rule_id)
        assert stage in stages.stages_for_mode(mode), (mode, rule_id)


def test_dds_other_stage_holds_exactly_explicit_and_foreign_rules():
    # «Прочее» в ДДС: явно x1 и m1 по §3, плюс правила другого режима (любые не отнесённые).
    other = {rid for rid in RULES if stages.stage_for_rule("dds", rid).id == stages.OTHER_STAGE_ID}
    assert other == {"x1", "m1"} | OPERATOR_RULES


def test_operator112_other_stage_holds_every_non_operator_rule():
    # По §3 в режиме специалиста все правила без op- уходят в «Прочее»: g1, f1, c1 — явно,
    # остальные (a4, c2, d1–d4, v*, s*, t*, m1, x1) — как неотнесённые.
    other = {rid for rid in RULES if stages.stage_for_rule("operator112", rid).id == stages.OTHER_STAGE_ID}
    assert other == NON_OPERATOR_RULES - OPERATOR_ADDRESS_RULES


def test_operator112_place_stage_takes_address_rules():
    for rule_id in ("op-a5", *sorted(OPERATOR_ADDRESS_RULES)):
        assert stages.stage_for_rule("operator112", rule_id).id == "place"


def test_shared_rules_get_different_stages_per_mode():
    # g1/f1/c1: «Карточка» в ДДС, «Прочее» у специалиста-112 — отражение §3.
    for rule_id in ("g1", "f1", "c1"):
        assert stages.stage_for_rule("dds", rule_id).id == "card"
        assert stages.stage_for_rule("operator112", rule_id).id == stages.OTHER_STAGE_ID


# ─── Простые формулировки ───────────────────────────────────────────────────────────────────────


def test_rule_plain_covers_registry_exactly():
    assert set(stages.RULE_PLAIN) == set(RULES)


@pytest.mark.parametrize("rule_id", sorted(RULES))
def test_rule_plain_is_short_russian_text_without_placeholders(rule_id: str):
    text = stages.RULE_PLAIN[rule_id]
    assert text.strip(), rule_id
    assert len(text) <= 90, (rule_id, len(text))
    assert "{" not in text and "}" not in text, rule_id


def test_rule_plain_fallback_for_unknown_and_missing_rule():
    assert stages.rule_plain("no-such-rule") == stages.UNKNOWN_RULE_PLAIN
    assert stages.rule_plain(None) == stages.UNKNOWN_RULE_PLAIN
    assert stages.rule_plain("a3") == stages.RULE_PLAIN["a3"]


# ─── Порядок этапов ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("mode", stages.MODES)
def test_stage_order_has_no_gaps_or_duplicates(mode: str):
    ordered = stages.stages_for_mode(mode)
    assert [stage.order for stage in ordered] == list(range(1, len(ordered) + 1))
    assert len({stage.id for stage in ordered}) == len(ordered)


@pytest.mark.parametrize("mode", stages.MODES)
def test_other_stage_is_last_and_carries_no_article(mode: str):
    last = stages.stages_for_mode(mode)[-1]
    assert last.id == stages.OTHER_STAGE_ID
    assert last.title == "Прочее"
    assert last.article_id is None


def test_stage_lookup_respects_mode_for_shared_ids():
    # intake/services/closing есть в обоих режимах; поиск обязан учитывать режим.
    assert stages.get_stage("dds", "services").title == "Службы"
    assert stages.get_stage("operator112", "services").title == "Оповещение служб"
    assert stages.get_stage("dds", "applicant") is None
    assert stages.get_stage("dds", "no-such-stage") is None


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        stages.stages_for_mode("unknown")
    with pytest.raises(ValueError):
        stages.stage_for_rule("", "t1")


# ─── Причинные связи ────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("mode", stages.MODES)
def test_chain_links_go_forward_only(mode: str):
    index = {stage.id: stage for stage in stages.stages_for_mode(mode)}
    assert stages.CHAINS[mode], mode
    for link in stages.CHAINS[mode]:
        source, target = index[link.source], index[link.target]
        assert source.order < target.order, (mode, link)
        assert target.id != stages.OTHER_STAGE_ID, (mode, link)
        assert link.caption.strip(), (mode, link)


@pytest.mark.parametrize("mode", stages.MODES)
def test_chain_from_returns_only_outgoing_links(mode: str):
    for stage in stages.stages_for_mode(mode):
        if stage.id == stages.OTHER_STAGE_ID:
            continue
        outgoing = stages.chain_from(mode, stage.id)
        assert all(link.source == stage.id for link in outgoing), (mode, stage.id)
        assert set(outgoing) == {link for link in stages.CHAINS[mode] if link.source == stage.id}


def test_chain_from_unknown_stage_raises():
    with pytest.raises(KeyError):
        stages.chain_from("dds", "no-such-stage")


def test_chain_from_leaf_stage_is_empty():
    assert stages.chain_from("dds", "closing") == ()


# ─── Статьи справочника ─────────────────────────────────────────────────────────────────────────


def test_article_ids_exist_in_kb():
    kb_ids = {json.loads(path.read_text(encoding="utf-8"))["id"] for path in KB_DIR.glob("kb-*.json")}
    # Защита от пустой проверки: при неверном пути каталога набор был бы пуст и тест прошёл бы вхолостую.
    assert kb_ids, f"каталог статей не найден или пуст: {KB_DIR}"
    for mode in stages.MODES:
        for stage in stages.stages_for_mode(mode):
            if stage.article_id is not None:
                assert stage.article_id in kb_ids, (mode, stage.id, stage.article_id)
