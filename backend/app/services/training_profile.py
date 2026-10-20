"""Профиль режима обучаемого (spec/008) поверх специализаций (фича 007, `User.specializations`).

Единственный источник — `User.specializations` (`operator112` | `dds`, одна или обе). «Профиль» spec/008 — производное
понятие: обучающийся с одной специализацией — «профиль» этого режима, с обеими — «не задан» (доступны оба режима).
Преподаватель и администратор профилем не ограничиваются. Задания `chain` правилом не затрагиваются: они выведены
и открываются только на чтение (spec/007), поэтому здесь не требуют обеих специализаций.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.models.user import DEFAULT_STUDENT_SPECIALIZATIONS, User

PROFILES = ("operator112", "dds")
PROFILE_GENITIVE = {"operator112": "специалиста-112", "dds": "диспетчера ДДС"}
MODE_TITLES = {"operator112": "112", "dds": "ДДС"}


def specializations_of(user: User) -> tuple[str, ...]:
    """Специализации обучающегося; запись без поля — как миграция 0007 («оператор ДДС»)."""
    return tuple(user.specializations or DEFAULT_STUDENT_SPECIALIZATIONS)


def profile_of(user: User) -> str | None:
    """Профиль spec/008: единственная специализация обучающегося; обе (или не обучающийся) — None, «не задан»."""
    if user.role != "student":
        return None
    owned = [item for item in PROFILES if item in specializations_of(user)]
    return owned[0] if len(owned) == 1 else None


def allows(user: User, mode: str) -> bool:
    if mode not in PROFILES or user.role != "student":
        return True
    return mode in specializations_of(user)


def short_name(full_name: str) -> str:
    """«Иванов Сергей Петрович» → «Иванов С. П.»."""
    last, *rest = full_name.split()
    return " ".join([last, *(f"{part[0]}." for part in rest)])


def _genitive(user: User, mode: str) -> str:
    # Отказ возможен только при одной специализации — другой, чем режим.
    return PROFILE_GENITIVE[profile_of(user) or next(item for item in PROFILES if item != mode)]


def blocked_message(user: User, mode: str) -> str:
    return f"Задание режима {MODE_TITLES[mode]} недоступно для учётной записи {_genitive(user, mode)}"


def create_rejection(blocked: list[User], mode: str, what: str = "Задание") -> str:
    profiles = ", ".join(dict.fromkeys(_genitive(user, mode) for user in blocked))
    names = ", ".join(short_name(user.full_name) for user in blocked)
    return f"{what} режима {MODE_TITLES[mode]} нельзя назначить: профиль {profiles} — {names}"


def split_by_profile(users: Iterable[User], mode: str) -> tuple[list[User], list[User]]:
    allowed: list[User] = []
    blocked: list[User] = []
    for user in users:
        (allowed if allows(user, mode) else blocked).append(user)
    return allowed, blocked
