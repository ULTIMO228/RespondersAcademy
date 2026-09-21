"""T043: у каждого правила оценщика — непустой источник и тип; семь нарушений памятки присутствуют."""

from __future__ import annotations

from ml.assess import rules

MEMO_TYPES = {"noPrimaryStatus", "wrongDecision", "refusedProfile", "missingComment", "incompleteComment", "noProgressStatus", "noContact"}


def test_every_rule_has_source_and_type():
    assert rules.RULES
    for rule in rules.RULES.values():
        assert rule.source.strip(), rule.id
        assert rule.error_type.strip(), rule.id
        assert rule.severity in ("critical", "major", "minor"), rule.id
        assert rule.text.strip(), rule.id


def test_seven_memo_violations_registered():
    memo_rules = [r for r in rules.RULES.values() if "памятка" in r.source and "нарушение №" in r.source]
    numbers = {int(r.source.split("нарушение №")[1][0]) for r in memo_rules}
    assert numbers == {1, 2, 3, 4, 5, 6, 7}
    assert MEMO_TYPES <= {r.error_type for r in memo_rules}


def test_error_message_contains_rule_source():
    error = rules.V4_MISSING_COMMENT.error(step="st-1", status="Не принята")
    assert error.message.endswith(rules.V4_MISSING_COMMENT.source)
    assert " — " in error.message
    contract = error.to_contract()
    assert contract["ruleId"] == "v4" and contract["step"] == "st-1" and contract["type"] == "missingComment"
