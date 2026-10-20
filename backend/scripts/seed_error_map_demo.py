"""Демо-набор карты ошибок (спека 003-error-map, задача T019). Детерминированные синтетические данные.

Создаёт (все id фиксированы, имена обезличенные, персональных данных нет):
  * 8 учебных групп: «ДДС-Демо-1…4» (режим dds, преподаватель morozova) и «112-Демо-1…4» (режим operator112,
    преподаватель kovalev). Группы добавляются в `assigned_groups` преподавателя: уже закреплённые группы
    не затираются (решение D7 — доступ только по закреплённым группам);
  * 36 обучающихся `u-901…u-936` (логины `demo-dds-N-NN` и `demo-112-N-NN`, пароль — как у учебных
    учётных записей, `DEMO_STUDENT_PASSWORD`);
  * по одному занятию на группу (`ses-701…ses-708`) и 132 оценённые попытки `att-701…att-832`
    с `Evaluation.errors`: `ruleId` — реальные правила `ml/assess/rules.py`, элементы в формате
    `AssessError.to_contract()`; этап каждого правила — по `stage_for_rule` из `error_map_stages.py`.

Даты: все оценки — за 1–12 дней до «сегодня» по МСК, то есть внутри окна 2w и, значит, 1m и all.
Поэтому числа карты одинаковы для любого периода.

Доля этапа = попытки с ошибкой на этапе / оценённые попытки группы (или обучающегося) в режиме.
«Часто» — доля больше 0,30; «мало данных» — попыток меньше minAttemptsGroup (5) или minAttemptsStudent (3).

Сценарии (для режима ДДС; для operator112 — те же, с этапами режима 112):
  1. «ДДС-Демо-1»: ни одного этапа «часто» — вывод «Критичных проблем нет».
  2. «ДДС-Демо-2»: ровно два этапа «часто» — «Тип происшествия» и «Статусы реагирования».
     Обучающийся с индексом 4 (пятый в группе) хуже группы на «Тип происшествия» и лучше на «Статусах».
     Для режима 112 — то же на «Суть происшествия» (хуже) и «Тип по классификатору» (лучше).
  3. «ДДС-Демо-3»: пять этапов «часто» (в выводе — три самых частых). Обучающийся с индексом 5
     сделал две попытки — «мало данных», сравнение не показывается.
  4. «ДДС-Демо-4»: четыре попытки группы при minAttemptsGroup 5 — все плитки серые, вывод без проблем.

Запуск (после `python -m app.seed.load`; `--reset` не требуется):

    cd backend && uv run python scripts/seed_error_map_demo.py

Повторный запуск ничего не дублирует: строки пишутся по фиксированным id. Сид `app.seed.load` перезаписывает
`assigned_groups` преподавателей из users.json, поэтому после него скрипт нужно запустить снова.
В stdout — JSON со сводкой (для логов стенда).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("ML_WARMUP", "0")

from sqlalchemy import select  # noqa: E402

from app.db.session import get_sessionmaker  # noqa: E402
from app.models.session import Attempt, Evaluation, TrainingSession  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.error_map_stages import LAYOUT, stage_for_rule  # noqa: E402
from app.services.security import hash_password  # noqa: E402
from app.services.time import MOSCOW, to_moscow_iso  # noqa: E402
from ml.assess.rules import RULES  # noqa: E402

DEMO_STUDENT_PASSWORD = "student112"  # как у учебных учётных записей сида (см. tests/conftest.py)
TEACHER_BY_MODE = {"dds": "morozova", "operator112": "kovalev"}
FIRST_STUDENT_NUMBER = 901  # u-901…
FIRST_SESSION_NUMBER = 701  # ses-701…
FIRST_ATTEMPT_NUMBER = 701  # att-701…
FIRST_ARM_NUMBER = 101
CARD_IDS = ("c-001", "c-002", "c-004", "c-007", "c-010", "c-012")  # карточки из сида cards.json

# Примерные значения для плейсхолдеров текстов правил: сообщение получается настоящим, как в штатном потоке.
RULE_FIELDS: dict[str, dict[str, Any]] = {
    "t1": {"fact": 38, "norm": 30},
    "t2": {"fact": 210, "norm": 180},
    "t3": {},
    "d1": {"target": "101 (главная)"},
    "d2": {"actual": "102 (главная)", "expected": "101 (главная)"},
    "d3": {},
    "d4": {"original": "c-001"},
    "tr1": {"trap": "повторный вызов", "actual": "Принята", "expected": "Не принята: дубль", "hint": ""},
    "v2": {"actual": "Принята", "expected": "Не принята", "hint": ""},
    "v2t": {"trap": "повторный вызов", "actual": "Принята", "expected": "Не принята: дубль", "hint": ""},
    "v1": {},
    "v3": {"actual": "Не принята", "expected": "Принята"},
    "v4": {"status": "Не принята"},
    "v5": {"status": "Работы начаты", "missing": "кому передана информация"},
    "v6": {"status": "Работы начаты"},
    "v6b": {"status": "Работы начаты"},
    "v6c": {"status": "Работы начаты"},
    "v6l": {"status": "Работы начаты", "delay": 95, "window": 60},
    "v7": {"number": "отдел контроля"},
    "s1": {"status": "Выехал"},
    "s2": {"actual": "Работы начаты, Выехал"},
    "s3": {},
    "a1": {"entered": "Дубнинская", "expected": "Дубининская"},
    "a2": {"entered": "Дубниская", "expected": "Дубнинская"},
    "a3": {"entered": "Тверская, 10", "expected": "Тверская, 12"},
    "a4": {"entered": "Выдуманная"},
    "c1": {"phrases": "«горит», «дым»"},
    "c2": {"items": "место, время"},
    "f1": {"field": "Адрес"},
    "g1": {"count": 3, "limit": 2},
    "x1": {"fact": 2, "threshold": 3},
    "m1": {"card": "c-002", "norm": 30},
    "op-t0": {},
    "op-t1": {"fact": 37, "norm": 30},
    "op-t2": {"fact": 240, "norm": 180},
    "op-t3": {},
    "op-a1": {"entered": "Иванова", "expected": "Иванов"},
    "op-a2": {"entered": "очевидец", "expected": "пострадавший"},
    "op-a3": {"entered": "000-00-00", "expected": "111-11-11"},
    "op-a4": {"expected": "111-11-11"},
    "op-a5": {},
    "op-d0": {},
    "op-d1": {"fact": "дым из окна"},
    "op-f0": {"expected": "Пожар в жилом доме"},
    "op-f1": {"actual": "Пожар на улице", "expected": "Пожар в жилом доме", "missing": ", признаки не совпали"},
    "op-s1": {"sign": "горит"},
    "op-s2": {"flag": "Пострадавшие", "reason": "есть пострадавший"},
    "op-s3": {"flag": "ЧС"},
    "op-f2": {"services": "МЧС"},
    "op-f3": {"services": "ФСО"},
}

STUDENT_NAMES: tuple[str, ...] = (
    "Соловьёва Нина Павловна",
    "Крылов Тимур Олегович",
    "Беляева Диана Романовна",
    "Громов Кирилл Алексеевич",
    "Лаптева Вероника Эдуардовна",
    "Никитин Глеб Станиславович",
    "Зиновьева Алёна Викторовна",
    "Рябов Степан Геннадьевич",
    "Мельникова Таисия Юрьевна",
    "Сорокин Руслан Маратович",
    "Ткаченко Лилия Вадимовна",
    "Федотова Ярослава Денисовна",
    "Щербаков Матвей Ильич",
    "Юдина Раиса Фёдоровна",
    "Ярцева Снежана Артуровна",
    "Андреев Константин Львович",
    "Чернова Милена Олеговна",
    "Ковригин Всеволод Тимурович",
    "Лебедева Оксана Станиславовна",
    "Макаров Егор Анатольевич",
    "Осипова Ирина Глебовна",
    "Прохоров Станислав Сергеевич",
    "Русакова Дарья Аркадьевна",
    "Степанов Ильназ Рустамович",
    "Тихонова Полина Эмилевна",
    "Уваров Антон Всеволодович",
    "Хохлова Эвелина Наильевна",
    "Цветков Михаил Аркадьевич",
    "Шилова Маргарита Павловна",
    "Болотова Вера Игоревна",
    "Гаврилов Арсений Дмитриевич",
    "Дьякова Кира Константиновна",
    "Елисеев Пётр Андреевич",
    "Жукова Лидия Евгеньевна",
    "Заварзин Фёдор Русланович",
    "Зайцева Алина Тимофеевна",
)


@dataclass(frozen=True)
class Scenario:
    """Одна учебная группа демо-набора. `prefer`/`exclude` — этап → индекс обучающегося в группе."""

    group: str
    mode: str
    attempts_per_student: tuple[int, ...]
    stage_errors: dict[str, int]  # этап → сколько попыток группы содержат ошибку на этом этапе
    prefer: dict[str, int] = field(default_factory=dict)  # его попытки берутся для ошибок первыми
    exclude: dict[str, int] = field(default_factory=dict)  # у него на этом этапе ошибок нет


SCENARIOS: tuple[Scenario, ...] = (
    # 1. Без «часто»: все доли ≤ 0,25 (редко/иногда).
    Scenario("ДДС-Демо-1", "dds", (4, 4, 4, 4, 4), {"intake": 1, "address": 1, "decision": 3, "card": 5, "services": 1, "route": 0, "statuses": 4, "closing": 1}),
    # 2. Ровно два «часто»: решение 0,40 и статусы 0,55. Обучающийся 4: хуже на решении, лучше на статусах.
    Scenario(
        "ДДС-Демо-2",
        "dds",
        (4, 4, 4, 4, 4),
        {"intake": 1, "address": 1, "decision": 8, "card": 4, "services": 3, "route": 1, "statuses": 11, "closing": 3},
        prefer={"decision": 4},
        exclude={"statuses": 4},
    ),
    # 3. Пять «часто» (0,36–0,55). Обучающийся 5 — две попытки, «мало данных».
    Scenario(
        "ДДС-Демо-3",
        "dds",
        (4, 4, 4, 4, 4, 2),
        {"intake": 1, "address": 8, "decision": 10, "card": 5, "services": 8, "route": 1, "statuses": 12, "closing": 9},
    ),
    # 4. Четыре попытки группы — меньше minAttemptsGroup (5): все плитки серые.
    Scenario("ДДС-Демо-4", "dds", (2, 2), {"intake": 1, "decision": 3, "card": 1, "statuses": 2}),
    # 1–4 для режима специалиста-112 — те же формы групп, этапы режима operator112.
    Scenario("112-Демо-1", "operator112", (4, 4, 4, 4, 4), {"intake": 1, "applicant": 1, "place": 3, "essence": 4, "type": 5, "signs": 1, "services": 1, "closing": 1}),
    Scenario(
        "112-Демо-2",
        "operator112",
        (4, 4, 4, 4, 4),
        {"intake": 1, "applicant": 1, "place": 3, "essence": 8, "type": 11, "signs": 3, "services": 3, "closing": 1},
        prefer={"essence": 4},
        exclude={"type": 4},
    ),
    Scenario(
        "112-Демо-3",
        "operator112",
        (4, 4, 4, 4, 4, 2),
        {"intake": 10, "applicant": 8, "place": 3, "essence": 4, "type": 12, "signs": 9, "services": 8, "closing": 1},
    ),
    Scenario("112-Демо-4", "operator112", (2, 2), {"intake": 2, "applicant": 1, "essence": 1, "type": 3}),
)


@dataclass(frozen=True)
class PlannedStudent:
    user_id: str
    login: str
    full_name: str
    arm_number: int
    group: str


@dataclass(frozen=True)
class PlannedAttempt:
    attempt_id: str
    session_id: str
    card_id: str
    student_id: str
    mode: str
    seq: int
    opened: datetime
    completed: datetime
    rule_ids: tuple[str, ...]
    reaction_ms: int
    processing_ms: int


@dataclass(frozen=True)
class Plan:
    students: tuple[PlannedStudent, ...]
    attempts: tuple[PlannedAttempt, ...]
    session_ids: dict[str, str]  # группа → id занятия
    student_ids_by_group: dict[str, tuple[str, ...]]


def plan_scenario_errors(scenario: Scenario, scenario_index: int) -> list[tuple[int, tuple[str, ...]]]:
    """Для каждой попытки группы: (индекс обучающегося, правила по ленте этапов).

    Этап получает ровно `stage_errors[этап]` попыток; ошибка на этапе — правило этого этапа из
    LAYOUT (по кругу). Выбор попыток детерминирован: сдвиг по этапу и группе, предпочтения/исключения.
    """
    slots = [student for student, count in enumerate(scenario.attempts_per_student) for _ in range(count)]
    total = len(slots)
    rules_by_stage = dict(LAYOUT[scenario.mode])
    picked: dict[str, list[int]] = {}
    for ordinal, (stage_id, count) in enumerate(scenario.stage_errors.items()):
        if count == 0:
            continue
        if stage_id not in rules_by_stage:
            raise ValueError(f"этап {stage_id} не существует в режиме {scenario.mode}")
        blocked = scenario.exclude.get(stage_id)
        candidates = [index for index in range(total) if slots[index] != blocked]
        if count > len(candidates):
            raise ValueError(f"{scenario.group}: этап {stage_id} — {count} попыток при {len(candidates)} доступных")
        shift = (ordinal * 5 + scenario_index) % len(candidates)
        rotated = candidates[shift:] + candidates[:shift]
        favoured = scenario.prefer.get(stage_id)
        if favoured is not None:
            rotated = [i for i in rotated if slots[i] == favoured] + [i for i in rotated if slots[i] != favoured]
        picked[stage_id] = rotated[:count]

    errors: list[list[str]] = [[] for _ in range(total)]
    for stage_id, rules in LAYOUT[scenario.mode]:
        for position, index in enumerate(picked.get(stage_id, [])):
            rule_id = rules[position % len(rules)]
            if stage_for_rule(scenario.mode, rule_id).id != stage_id:
                raise ValueError(f"правило {rule_id} не относится к этапу {stage_id} в режиме {scenario.mode}")
            errors[index].append(rule_id)
    return [(slots[index], tuple(rule_ids)) for index, rule_ids in enumerate(errors)]


def build_plan(now: datetime) -> Plan:
    students: list[PlannedStudent] = []
    attempts: list[PlannedAttempt] = []
    session_ids: dict[str, str] = {}
    student_ids_by_group: dict[str, tuple[str, ...]] = {}
    name_iter = iter(STUDENT_NAMES)
    arm_number = FIRST_ARM_NUMBER
    attempt_number = FIRST_ATTEMPT_NUMBER
    student_number = FIRST_STUDENT_NUMBER

    for scenario_index, scenario in enumerate(SCENARIOS):
        mode_tag = "dds" if scenario.mode == "dds" else "112"
        number_in_mode = scenario.group.rsplit("-", 1)[1]
        group_students: list[str] = []
        for position, _ in enumerate(scenario.attempts_per_student):
            user_id = f"u-{student_number}"
            students.append(
                PlannedStudent(
                    user_id=user_id,
                    login=f"demo-{mode_tag}-{number_in_mode}-{position + 1:02d}",
                    full_name=next(name_iter),
                    arm_number=arm_number,
                    group=scenario.group,
                )
            )
            group_students.append(user_id)
            student_number += 1
            arm_number += 1
        student_ids_by_group[scenario.group] = tuple(group_students)
        session_id = f"ses-{FIRST_SESSION_NUMBER + scenario_index}"
        session_ids[scenario.group] = session_id

        for seq, (student_index, rule_ids) in enumerate(plan_scenario_errors(scenario, scenario_index)):
            offset = attempt_number - FIRST_ATTEMPT_NUMBER
            day = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1 + offset % 12)
            opened = day + timedelta(hours=9 + offset % 9, minutes=(offset * 7) % 60)
            completed = opened + timedelta(minutes=3 + offset % 4)
            attempts.append(
                PlannedAttempt(
                    attempt_id=f"att-{attempt_number}",
                    session_id=session_id,
                    card_id=CARD_IDS[offset % len(CARD_IDS)],
                    student_id=group_students[student_index],
                    mode=scenario.mode,
                    seq=seq,
                    opened=opened,
                    completed=completed,
                    rule_ids=rule_ids,
                    reaction_ms=15_000 + (offset * 2_300) % 20_000,
                    processing_ms=120_000 + (offset * 4_100) % 50_000,
                )
            )
            attempt_number += 1
    return Plan(tuple(students), tuple(attempts), session_ids, student_ids_by_group)


async def _upsert(db: Any, model: Any, key: Any, values: dict[str, Any]) -> None:
    row = await db.get(model, key)
    if row is None:
        db.add(model(**values))
        return
    for name, value in values.items():
        setattr(row, name, value)


async def _assign_groups(db: Any, login: str, groups: list[str]) -> None:
    teacher = (await db.execute(select(User).where(User.login == login))).scalar_one_or_none()
    if teacher is None or teacher.role != "teacher":
        raise SystemExit(f"Нет учётной записи преподавателя «{login}»: сначала `python -m app.seed.load`")
    current = list(teacher.assigned_groups or [])
    teacher.assigned_groups = list(dict.fromkeys([*current, *groups]))


def _error_contract(rule_id: str) -> dict[str, Any]:
    """Элемент `Evaluation.errors` в формате `AssessError.to_contract()` (type, severity, message, ruleId)."""
    return RULES[rule_id].error(**RULE_FIELDS[rule_id]).to_contract()


async def seed_error_map_demo() -> dict[str, Any]:
    plan = build_plan(datetime.now(MOSCOW))
    scenario_by_group = {scenario.group: scenario for scenario in SCENARIOS}
    password_hash = hash_password(DEMO_STUDENT_PASSWORD)
    async with get_sessionmaker()() as db:
        for student in plan.students:
            await _upsert(
                db,
                User,
                student.user_id,
                {
                    "id": student.user_id,
                    "login": student.login,
                    "password_hash": password_hash,
                    "full_name": student.full_name,
                    "role": "student",
                    "arm_number": student.arm_number,
                    "is_active": True,
                    "group": student.group,
                    "service": None,
                    "assigned_groups": None,
                },
            )
        for mode, login in TEACHER_BY_MODE.items():
            groups = [scenario.group for scenario in SCENARIOS if scenario.mode == mode]
            await _assign_groups(db, login, groups)

        for scenario_group, session_id in plan.session_ids.items():
            scenario = scenario_by_group[scenario_group]
            mine = [attempt for attempt in plan.attempts if attempt.session_id == session_id]
            await _upsert(
                db,
                TrainingSession,
                session_id,
                {
                    "id": session_id,
                    "teacher_id": (await db.execute(select(User.id).where(User.login == TEACHER_BY_MODE[scenario.mode]))).scalar_one(),
                    "student_ids": list(plan.student_ids_by_group[scenario_group]),
                    "scenario_ids": [],
                    "mode": "practice",
                    "card_source": "generated",
                    "card_flow": [],
                    "state": "finished",
                    "started_at": to_moscow_iso(min(attempt.opened for attempt in mine)),
                    "finished_at": to_moscow_iso(max(attempt.completed for attempt in mine)),
                    "plan": None,
                    "paused_at": None,
                    "parked": [],
                    "training_mode": scenario.mode,
                    "format": "training",
                    "exam": None,
                },
            )

        for attempt in plan.attempts:
            opened = to_moscow_iso(attempt.opened)
            completed = to_moscow_iso(attempt.completed)
            is_operator = attempt.mode == "operator112"
            await _upsert(
                db,
                Attempt,
                attempt.attempt_id,
                {
                    "id": attempt.attempt_id,
                    "session_id": attempt.session_id,
                    "card_id": attempt.card_id,
                    "student_id": attempt.student_id,
                    "mode": attempt.mode,
                    "opened_at": opened,
                    "primary_reaction_ms": attempt.reaction_ms,
                    "statuses": [],
                    "services_called": [],
                    "completed_at": completed,
                    "full_processing_ms": attempt.processing_ms,
                    "entered_text": {},
                    "calls": [],
                    "seq": attempt.seq,
                    "card_snapshot": None,
                    "answered_at": to_moscow_iso(attempt.opened + timedelta(seconds=8)) if is_operator else None,
                    "aon": None,
                    "incident_number": None,
                    "state": "submitted" if is_operator else None,
                    "events": None,
                },
            )
            errors = [_error_contract(rule_id) for rule_id in attempt.rule_ids]
            count = len(errors)
            await _upsert(
                db,
                Evaluation,
                attempt.attempt_id,
                {
                    "attempt_id": attempt.attempt_id,
                    "assessor_version": "demo-error-map-1",
                    "time_score": 100,
                    "correctness_score": max(0, 100 - 12 * count),
                    "grammar_score": 100,
                    "semantic_score": 100,
                    "total_score": max(0, 100 - 10 * count),
                    "grammar_errors": [],
                    "errors": errors,
                    "ai_comment": "",
                    "components": None,
                    "generated_at": completed,
                    "passed": None,
                    "mode": attempt.mode,
                },
            )
        await db.commit()
    return {
        "groups": len(SCENARIOS),
        "students": len(plan.students),
        "sessions": len(plan.session_ids),
        "attempts": len(plan.attempts),
        "attemptsWithErrors": sum(1 for attempt in plan.attempts if attempt.rule_ids),
    }


def main() -> None:
    print(json.dumps(asyncio.run(seed_error_map_demo()), ensure_ascii=False))


if __name__ == "__main__":
    main()
