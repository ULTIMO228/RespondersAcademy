"""Компонент «адрес»: адресные поля ручного ввода против адреса билета по справочнику улиц (R3, FR-039).

В режиме B адрес обычно не вводится — тогда компонент не применим. Применяется к полям, чей ключ похож на
адресный (address/addr/street/адрес) или значение содержит тип улицы («ул.», «проезд», …).
"""

from __future__ import annotations

import re

from ml.assess import rules
from ml.assess.types import AssessContext, ComponentResult
from ml.nlp import address as address_nlp

NAME = "address"
ADDRESS_KEY = re.compile(r"address|addr|street|адрес|улиц", re.IGNORECASE)
ADDRESS_VALUE = re.compile(r"\b(ул\.?|улица|пер\.?|переулок|просп\.?|проспект|пр-т|проезд|шоссе|ш\.|бульвар|б-р|наб\.?|набережная|площадь|пл\.)\s", re.IGNORECASE)
SCORES = {"exact": 1.0, "typo": 0.7, "lookalike": 0.4, "unknown": 0.5, "mismatch": 0.0}


def address_fields(entered: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in entered.items() if v.strip() and (ADDRESS_KEY.search(k) or ADDRESS_VALUE.search(v + " "))}


def run(ctx: AssessContext) -> ComponentResult:
    result = ComponentResult(name=NAME, score=1.0)
    fields = address_fields(ctx.entered_text)
    expected = str((ctx.card or {}).get("addressRefined") or (ctx.card or {}).get("address") or "")
    if not fields or not expected:
        result.applicable = False
        return result
    if not address_nlp.load_streets():
        result.available = False
        result.applicable = False
        result.warnings.append("Справочник улиц недоступен: адрес не проверялся")
        return result
    scores: list[float] = []
    for field, value in fields.items():
        check = address_nlp.compare(value, expected)
        scores.append(SCORES.get(check.kind, 0.0))
        entered_name = check.entered.street.name if check.entered.street else check.entered.query
        expected_name = check.expected.street.name if check.expected.street else check.expected.query
        if check.kind == "lookalike":
            result.errors.append(rules.ADDRESS_LOOKALIKE.error(step=f"field:{field}", entered=entered_name, expected=expected_name))
        elif check.kind == "typo":
            result.errors.append(rules.ADDRESS_TYPO.error(step=f"field:{field}", entered=check.entered.query, expected=expected_name))
        elif check.kind == "mismatch":
            result.errors.append(rules.ADDRESS_MISMATCH.error(step=f"field:{field}", entered=entered_name, expected=expected_name))
        elif check.kind == "unknown":
            result.errors.append(rules.ADDRESS_UNKNOWN.error(step=f"field:{field}", entered=check.entered.query))
        result.details[field] = {"kind": check.kind, "ratio": check.ratio, "expected": expected_name}
    result.score = sum(scores) / len(scores)
    return result
