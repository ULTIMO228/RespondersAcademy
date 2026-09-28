"""Детерминированные проверки структуры, ПДн, кодов ЕКП, адресов и ссылок (T041)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# Допустимые префиксы и форматы кодов ЕКП
VALID_EKP_PREFIXES = ("101", "102", "103", "104", "112")

PHONE_PATTERN = re.compile(r"(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}")
EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
NAME_MARKERS = re.compile(r"\b(?:Иванов|Петров|Сидоров|[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)\b")

# Допустимые статусы ДДС
VALID_DDS_STATUSES = {"opened", "assigned", "arrived", "departed", "completed", "cancelled"}

# Заведомо недопустимые маркеры вымышленных адресов
FAKE_ADDRESS_MARKERS = ["вымышлен", "несуществующ", "тестов", "fake"]


@dataclass(frozen=True)
class ChecksResult:
    passed: bool
    failures: list[str] = field(default_factory=list)


def run_deterministic_checks(
    candidate: dict[str, Any],
    *,
    allowed_fact_ids: list[str] | None = None,
    allowed_error_ids: list[str] | None = None,
    mode: str = "operator112",
) -> ChecksResult:
    """Выполняет детерминированную проверку сгенерированного кандидата ответа."""
    failures: list[str] = []
    text = str(candidate.get("text") or candidate.get("rationale") or "")

    # 1. Проверка ПДн
    if PHONE_PATTERN.search(text) or EMAIL_PATTERN.search(text) or NAME_MARKERS.search(text):
        failures.append("Обнаружены персональные данные (ПДн) в тексте кандидата")

    # 2. Проверка на циклы и повторы фраз
    words = text.split()
    if len(words) >= 15:
        # Проверяем повторение 2-3 слов подряд
        for window in range(2, 5):
            for i in range(len(words) - window * 4):
                phrase = " ".join(words[i : i + window])
                occurrences = text.count(phrase)
                if occurrences >= 5:
                    failures.append(f"Обнаружен цикл / повтор фразы: '{phrase}' ({occurrences} раз)")
                    break
            if any("цикл" in f for f in failures):
                break

    # 3. Проверка кода ЕКП
    ekp_code = candidate.get("ekp_code")
    if ekp_code is not None:
        ekp_str = str(ekp_code).strip()
        # Должен быть цифровой код из 3-5 цифр с допустимым префиксом
        if not re.fullmatch(r"\d{3,5}", ekp_str):
            failures.append(f"Недопустимый формат кода ЕКП: {ekp_str}")
        elif not ekp_str.startswith(VALID_EKP_PREFIXES):
            failures.append(f"Выдуманный код ЕКП вне классификатора: {ekp_str}")


    # 4. Проверка адреса
    address = candidate.get("address")
    if address is not None:
        addr_str = str(address).lower()
        if any(marker in addr_str for marker in FAKE_ADDRESS_MARKERS):
            failures.append(f"Выдуманный или тестовый адрес: {address}")

    # 5. Проверка ссылок на смысловые факты эталона
    ref_facts = candidate.get("reference_fact_ids") or candidate.get("factIds") or []
    if allowed_fact_ids is not None:
        unknown_facts = [fid for fid in ref_facts if fid not in allowed_fact_ids]
        if unknown_facts:
            failures.append(f"Выдуманные идентификаторы фактов эталона: {unknown_facts}")

    # 6. Проверка ссылок на ошибки
    ref_errors = candidate.get("errorIds") or []
    if allowed_error_ids is not None:
        unknown_errors = [eid for eid in ref_errors if eid not in allowed_error_ids]
        if unknown_errors:
            failures.append(f"Выдуманные идентификаторы ошибок: {unknown_errors}")

    # 7. Проверка статуса реагирования ДДС
    if mode == "dds" and "status" in candidate:
        dds_status = str(candidate["status"]).strip()
        if dds_status not in VALID_DDS_STATUSES:
            failures.append(f"Недопустимый статус реагирования ДДС: {dds_status}")

    return ChecksResult(
        passed=len(failures) == 0,
        failures=failures,
    )
