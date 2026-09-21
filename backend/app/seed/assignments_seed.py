"""Демо-задания режима специалиста-112 (Phase 10, US3): тренировка и экзамен для курсантов ДДС-01.

Сида фронта для заданий нет (лобби — волна B), поэтому набор задан здесь. Билеты — московские карточки разных групп
с полными ФИО заявителя (озвучиваются лучше), без чужого региона. Параметры — нормативы FR-011/FR-016 и подсказки FR-017.
"""

from __future__ import annotations

DEFAULT_PARAMS = {
    "norms": {"answerSec": 30, "submitSec": 180},
    "hints": {"enabled": True, "idleSec": 20},
    "maxGrammarErrors": 1,
}

ASSIGNMENTS_SEED = [
    {
        "id": "asg-001",
        "teacher_id": "u-002",
        "student_ids": ["u-005", "u-006"],
        "training_mode": "operator112",
        "format": "training",
        "card_ids": ["c-010", "c-050"],
        "params": DEFAULT_PARAMS,
        "state": "active",
        "created_at": "2026-09-22T09:00:00+03:00",
        "title": "Режим 112: приём вызова и карточка (тренировка)",
    },
    {
        "id": "asg-002",
        "teacher_id": "u-002",
        "student_ids": ["u-005", "u-006"],
        "training_mode": "operator112",
        "format": "exam",
        "card_ids": ["c-071", "c-090"],
        "params": {**DEFAULT_PARAMS, "hints": {"enabled": False, "idleSec": 20}, "passThreshold": 70, "timeLimitSec": 600},
        "state": "active",
        "created_at": "2026-09-22T09:05:00+03:00",
        "title": "Режим 112: экзамен (2 билета)",
    },
]
