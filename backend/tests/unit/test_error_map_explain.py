"""Пояснение этапа (T054, US6): шаблон, шлюз, откат на шаблон, сеть, неизменность уровней.

Пояснение — подсказка преподавателю: оно не меняет светофор, оценки и вывод (FR-018) и не обращается к сети
(FR-019, конституция I). Источник текста — `ai` (локальная модель через шлюз) или `template` (правило без модели).
Тесты разделены на чистые функции (шаблон, хэш, очистка ответа шлюза) и сквозной `build_explanation` на in-memory базе.
"""

from __future__ import annotations

import re
import socket
from datetime import datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app import ai_gateway
from app.api.deps import Viewer
from app.db.base import Base
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.schemas.error_map import (
    ErrorMapStage,
    ErrorMapStageLevel,
    ErrorMapStudentRef,
    ErrorMapTypicalError,
)
from app.services.error_map_explain import (
    build_explanation,
    clean_gateway_text,
    plural_students,
    template_text,
    text_hash,
)
from app.services.error_map_service import group_map, stage_detail, student_stage_detail
from app.services.time import MOSCOW, to_moscow_iso

ADMIN = Viewer(user_id="adm", role="admin")
GROUP = "G-EXPL"

STAGE = ErrorMapStage(id="statuses", order=7, title="Статусы реагирования")


def _typical(rule_id: str, plain: str, count: int, severity: str = "critical") -> ErrorMapTypicalError:
    return ErrorMapTypicalError(
        rule_id=rule_id,
        plain_text=plain,
        severity=severity,
        student_count=count,
        students=[ErrorMapStudentRef(id=f"u-{index}", name=f"Студент {index}") for index in range(count)],
    )


def _level(level: str = "often", share: float | None = 0.5, **extra: Any) -> ErrorMapStageLevel:
    data: dict[str, Any] = {
        "stage_id": "statuses",
        "attempts": 10,
        "attempts_with_error": 5,
        "share": share,
        "level": level,
        "affected_students": 4,
    }
    data.update(extra)
    return ErrorMapStageLevel(**data)


def _sentences(text: str) -> list[str]:
    return [part for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part]


# ---------------------------------------------------------------------------------------------------------------
# Чистые функции
# ---------------------------------------------------------------------------------------------------------------


def test_template_is_one_or_two_sentences_about_the_dominant_error():
    errors = [_typical("v1", "Нет первичного статуса", 4), _typical("v4", "Нет комментария к статусу", 2)]
    text = template_text(stage_title=STAGE.title, typical_errors=errors, subject="group")
    sentences = _sentences(text)
    assert 1 <= len(sentences) <= 2
    assert "«Статусы реагирования»" in text
    assert "нет первичного статуса" in text.lower()  # доминирующая ошибка — первая в списке
    assert "комментария" not in text  # вторая ошибка в пояснение не попадает
    assert "4 обучающихся" in text  # «так ошибаются…» — по числу обучающихся доминирующей ошибки


def test_template_for_student_does_not_compare_with_others():
    text = template_text(stage_title=STAGE.title, typical_errors=[_typical("v1", "Нет первичного статуса", 1)], subject="student")
    assert 1 <= len(_sentences(text)) <= 2
    for word in ("обучающихся", "группа", "групп", "других", "хуже", "лучше"):
        assert word not in text.lower()


def test_template_without_errors_says_there_is_nothing_to_explain():
    text = template_text(stage_title=STAGE.title, typical_errors=[], subject="group")
    assert len(_sentences(text)) == 1
    assert "заметных ошибок нет" in text


def test_template_is_deterministic_and_hash_is_stable_for_the_same_text():
    errors = [_typical("v1", "Нет первичного статуса", 3)]
    first = template_text(stage_title=STAGE.title, typical_errors=errors, subject="group")
    second = template_text(stage_title=STAGE.title, typical_errors=errors, subject="group")
    assert first == second
    assert text_hash(first) == text_hash(second)
    assert re.fullmatch(r"[0-9a-f]{64}", text_hash(first))  # ровно столько, сколько позволяет колонка text_hash
    assert text_hash(first) != text_hash(first + "!")


@pytest.mark.parametrize(
    ("count", "expected"),
    [(1, "1 обучающийся"), (2, "2 обучающихся"), (4, "4 обучающихся"), (5, "5 обучающихся"), (11, "11 обучающихся"), (21, "21 обучающийся"), (22, "22 обучающихся")],
)
def test_plural_students(count, expected):
    assert plural_students(count) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Путают тип  и службы.  Тренировать адрес. ", "Путают тип и службы. Тренировать адрес."),
        ("Одна. Две. Три. Четыре.", "Одна. Две."),  # не больше двух фраз
        ("Без точки в конце", "Без точки в конце"),
        ("", None),
        ("   \n ", None),
        (None, None),
        (42, None),
        ("Очень длинный текст. " * 40, None),  # длиннее лимита — не вывод, а мусор: уходим на шаблон
    ],
)
def test_clean_gateway_text(raw, expected):
    assert clean_gateway_text(raw) == expected


# ---------------------------------------------------------------------------------------------------------------
# build_explanation: шлюз → шаблон
# ---------------------------------------------------------------------------------------------------------------


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture(autouse=True)
def restore_gateway():
    yield
    ai_gateway.set_gateway(None)


class _Gateway:
    """Подмена шлюза: возвращает текст или бросает исключение; запоминает вызовы."""

    def __init__(self, answer: Any = None, error: Exception | None = None) -> None:
        self.answer, self.error, self.calls = answer, error, []

    def explain_stage(self, mode, stage, errors, context):
        self.calls.append((mode, stage, errors, context))
        if self.error:
            raise self.error
        return self.answer


async def _explain(maker, *, level: ErrorMapStageLevel | None = None, errors=None, subject="group"):
    async with maker() as db:
        return await build_explanation(
            db,
            ADMIN,
            group_id=GROUP,
            student_id="" if subject == "group" else "u-1",
            mode="dds",
            stage=STAGE,
            level=level or _level(),
            typical_errors=errors if errors is not None else [_typical("v1", "Нет первичного статуса", 3)],
            subject=subject,
        )


@pytest.mark.asyncio
async def test_default_gateway_gives_template(maker):
    result = await _explain(maker)
    assert result is not None
    assert result.source == "template"
    assert result.text == template_text(stage_title=STAGE.title, typical_errors=[_typical("v1", "Нет первичного статуса", 3)], subject="group")
    assert result.text_hash == text_hash(result.text)
    assert result.verdict is None
    assert len(_sentences(result.text)) <= 2


@pytest.mark.asyncio
async def test_gateway_text_is_used_and_marked_ai(maker):
    gateway = _Gateway(answer="  Группа путает тип происшествия. Стоит повторить классификатор. Лишнее предложение. ")
    ai_gateway.set_gateway(gateway)
    result = await _explain(maker)
    assert result is not None
    assert result.source == "ai"
    assert result.text == "Группа путает тип происшествия. Стоит повторить классификатор."  # очищено и не больше двух фраз
    assert result.text_hash == text_hash(result.text)
    (mode, stage, errors, context), = gateway.calls
    assert mode == "dds" and stage == {"id": "statuses", "title": "Статусы реагирования"}
    assert errors == [{"ruleId": "v1", "plainText": "Нет первичного статуса", "severity": "critical", "studentCount": 3}]
    assert context["subject"] == "group" and context["level"]["level"] == "often"


@pytest.mark.asyncio
@pytest.mark.parametrize("answer", [None, "", "   ", 123, "Слишком длинный. " * 60])
async def test_unusable_gateway_answer_falls_back_to_template(maker, answer):
    ai_gateway.set_gateway(_Gateway(answer=answer))
    result = await _explain(maker)
    assert result is not None and result.source == "template"


@pytest.mark.asyncio
async def test_gateway_exception_falls_back_to_template(maker):
    ai_gateway.set_gateway(_Gateway(error=RuntimeError("модель недоступна")))
    result = await _explain(maker)
    assert result is not None and result.source == "template"


@pytest.mark.asyncio
async def test_gateway_without_the_method_is_fine(maker):
    class Old:  # реализация шлюза без explain_stage (метод необязательный)
        pass

    ai_gateway.set_gateway(Old())  # type: ignore[arg-type]
    result = await _explain(maker)
    assert result is not None and result.source == "template"


@pytest.mark.asyncio
async def test_no_data_means_no_explanation(maker):
    gateway = _Gateway(answer="Не должно вызываться.")
    ai_gateway.set_gateway(gateway)
    assert await _explain(maker, level=_level("noData", share=None)) is None
    assert gateway.calls == []  # без данных не тратим и вызов модели


@pytest.mark.asyncio
async def test_explanation_needs_no_network_on_both_paths(maker, monkeypatch):
    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("пояснение не должно обращаться к сети")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    assert (await _explain(maker)).source == "template"  # путь «шаблон»
    ai_gateway.set_gateway(_Gateway(answer="Текст от модели."))
    assert (await _explain(maker)).source == "ai"  # путь «шлюз»


@pytest.mark.asyncio
async def test_explanation_does_not_change_the_level(maker):
    level = _level("often", 0.5)
    before = level.model_dump()
    ai_gateway.set_gateway(_Gateway(answer="Текст от модели."))
    await _explain(maker, level=level)
    assert level.model_dump() == before  # объект уровня не тронут пояснением


# ---------------------------------------------------------------------------------------------------------------
# Подключение к разбору этапа: поле explanation и неизменность светофора
# ---------------------------------------------------------------------------------------------------------------


async def _seed(maker: async_sessionmaker[AsyncSession]) -> None:
    """Группа из 6 попыток dds за последние дни; у 4 есть ошибка v1 (этап «Статусы»), у одного — ещё v2."""
    now = datetime.now(MOSCOW)
    async with maker() as db:
        db.add(User(id="u-1", login="u-1", password_hash="x", full_name="Один", role="student", arm_number=1, group=GROUP))
        for number in range(6):
            stamp = to_moscow_iso(now - timedelta(days=1, minutes=number))
            attempt_id = f"a-{number}"
            errors = [{"ruleId": "v1", "type": "noPrimaryStatus", "severity": "critical"}] if number < 4 else []
            db.add(Attempt(id=attempt_id, session_id=f"s-{number}", card_id="c-1", student_id="u-1", mode="dds", opened_at=stamp))
            db.add(
                Evaluation(
                    attempt_id=attempt_id, mode="dds", time_score=0, correctness_score=0, grammar_score=0,
                    semantic_score=0, total_score=0, errors=errors, generated_at=stamp,
                )
            )
        await db.commit()


@pytest.mark.asyncio
async def test_stage_detail_carries_explanation_and_levels_do_not_depend_on_it(maker):
    await _seed(maker)
    async with maker() as db:
        without_ai = await stage_detail(db, ADMIN, GROUP, "statuses", "dds", "1m")
        map_before = (await group_map(db, ADMIN, GROUP, "dds", "1m")).dump()
    assert without_ai.explanation is not None and without_ai.explanation.source == "template"

    ai_gateway.set_gateway(_Gateway(answer="Группа не ставит первичный статус."))
    async with maker() as db:
        with_ai = await stage_detail(db, ADMIN, GROUP, "statuses", "dds", "1m")
        map_after = (await group_map(db, ADMIN, GROUP, "dds", "1m")).dump()
    assert with_ai.explanation is not None and with_ai.explanation.source == "ai"
    assert with_ai.level == without_ai.level  # светофор тот же, что без ИИ
    assert with_ai.typical_errors == without_ai.typical_errors
    assert map_before["levels"] == map_after["levels"]  # карта и вывод от пояснения не зависят
    assert map_before["headline"] == map_after["headline"]


@pytest.mark.asyncio
async def test_student_stage_detail_has_student_wording(maker):
    await _seed(maker)
    async with maker() as db:
        detail = await student_stage_detail(db, ADMIN, "u-1", "statuses", "dds", "1m")
    assert detail.explanation is not None
    assert "обучающихся" not in detail.explanation.text  # карта человека — без слов про группу


@pytest.mark.asyncio
async def test_no_data_stage_detail_has_no_explanation(maker):
    async with maker() as db:
        db.add(User(id="u-1", login="u-1", password_hash="x", full_name="Один", role="student", arm_number=1, group=GROUP))
        await db.commit()
        detail = await stage_detail(db, ADMIN, GROUP, "statuses", "dds", "1m")
    assert detail.level.level == "noData"
    assert detail.explanation is None
