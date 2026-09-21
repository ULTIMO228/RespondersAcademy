"""Групповые инсайты занятия (FR-049): детерминированные фразы по отчётам курсантов, без LLM.

`build_insights(session, reports)` — `reports` в форме Report контракта (с `attempts` — списком попыток
с нормативами, см. report_builder). Формат: «N % группы: <тип ошибки>» + сводка по нормативам и
рекомендация категории для следующего занятия.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

NO_ATTEMPTS_INSIGHT = "Нет данных по попыткам: за занятие не завершена ни одна карточка — сводные показатели не рассчитаны."

ERROR_TITLES = {
    "timeReactionExceeded": "превышен норматив первичной реакции",
    "timeProcessingExceeded": "превышено время полной отработки",
    "timeNotCompleted": "карточка не отработана до конца занятия",
    "noPrimaryStatus": "нет статуса реагирования (памятка №1)",
    "wrongDecision": "статус не соответствует заявке (памятка №2)",
    "refusedProfile": "отказ от профильного происшествия (памятка №3)",
    "missingComment": "нет комментария к отказу (памятка №4)",
    "incompleteComment": "неполный комментарий к отказу (памятка №5)",
    "noProgressStatus": "нет статусов хода работ (памятка №6)",
    "noContact": "не обеспечена оперативная связь (памятка №7)",
    "missedRequiredCall": "пропущен регламентный звонок точке C",
    "wrongRecipient": "информация передана не той службе",
    "transferMissing": "не выполнен перевод вызова в другой регион",
    "statusMissing": "не проставлен ожидаемый статус",
    "statusSequenceOrder": "нарушен порядок статусов",
    "keyPhraseMissing": "в действиях не отражены ключевые формулировки эталона",
    "requiredFieldMissing": "не заполнены обязательные поля",
    "grammarLimitExceeded": "превышен лимит грамматических ошибок",
    "addressLookalike": "похожая улица в адресе",
    "addressTypo": "опечатка в адресе",
    "parallelCardIgnored": "не открыта параллельная карточка",
    "reportIncomplete": "неполный доклад точке C",
}
MAX_TYPE_INSIGHTS = 3


def _title(error_type: str) -> str:
    return ERROR_TITLES.get(error_type, error_type)


def average(values: list[int | float]) -> int:
    return int(sum(values) // len(values)) if values else 0


def build_insights(session: dict[str, Any], reports: list[dict[str, Any]]) -> list[str]:
    with_attempts = [r for r in reports if r.get("attempts")]
    if not with_attempts:
        return [NO_ATTEMPTS_INSIGHT]
    total = len(with_attempts)
    insights = [f"Инсайты ИИ: отчёт по {total} из {len(reports)} курсантов, средний балл группы {average([r['score'] for r in with_attempts])}."]
    # Доля группы с каждым типом ошибки (курсант считается один раз на тип).
    by_type: Counter[str] = Counter()
    for report in with_attempts:
        for error_type in {e.get("type") for e in report.get("errors", []) if e.get("type")}:
            by_type[error_type] += 1
    grammar_students = sum(1 for r in with_attempts if r.get("grammarErrors"))
    if grammar_students:
        by_type["__grammar__"] = grammar_students
    ranked = sorted(by_type.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_TYPE_INSIGHTS]
    for error_type, count in ranked:
        share = round(100 * count / total)
        title = "орфографические ошибки в ручном вводе" if error_type == "__grammar__" else _title(error_type)
        insights.append(f"{share} % группы: {title} ({count} из {total}).")
    if not ranked:
        insights.append("Ошибок по эталону и грамматике в группе не зафиксировано.")
    # Нормативы времени.
    slow = sum(1 for r in with_attempts if any(a["attempt"].get("primaryReactionMs", 0) > a["norms"]["primaryReactionMs"] for a in r["attempts"]))
    norm_sec = round(with_attempts[0]["attempts"][0]["norms"]["primaryReactionMs"] / 1000)
    insights.append(
        f"Норматив первичной реакции ({norm_sec} с) соблюдён всеми курсантами занятия." if slow == 0 else f"{slow} из {total} курсантов превысили норматив первичной реакции ({norm_sec} с) — повторить регламент первичной обработки."
    )
    critical = sum(1 for r in with_attempts for e in r.get("errors", []) if e.get("severity") == "critical")
    if critical:
        insights.append(f"Критичных отклонений от эталона: {critical} — разобрать регламентные звонки точке C и первичные решения перед следующим занятием.")
    # Категория для следующего занятия: группа карточек с наибольшим числом ошибок.
    by_group: Counter[str] = Counter()
    for report in with_attempts:
        for attempt in report["attempts"]:
            group = attempt.get("group")
            if group:
                by_group[group] += len(attempt.get("errors", []))
    if by_group:
        worst, count = max(sorted(by_group.items()), key=lambda kv: kv[1])
        if count > 0:
            insights.append(f"Рекомендуемая категория следующего занятия: «{worst}» (ошибок в группе: {count}).")
        else:
            insights.append("Группа готова к повышению сложности: ошибок по категориям не зафиксировано.")
    return insights
