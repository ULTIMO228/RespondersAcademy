"""Профиль режима обучаемого (spec/008): курсант с профилем получает задания и занятия только своего режима.

Профиль — `User.training_profile` ("operator112" | "dds"); None — «не задан», доступны оба режима.
Задания `chain` правилом не затрагиваются: они выведены и открываются только на чтение (spec/007).
"""

from __future__ import annotations

from collections.abc import Iterable

from app.models.user import User

PROFILES = ("operator112", "dds")
PROFILE_GENITIVE = {"operator112": "специалиста-112", "dds": "диспетчера ДДС"}
PROFILE_TITLES = {"operator112": "Специалист системы-112", "dds": "Диспетчер ДДС"}
NO_PROFILE_TITLE = "Не задан"
MODE_TITLES = {"operator112": "112", "dds": "ДДС"}
INVALID_PROFILE_MESSAGE = "Профиль режима: специалист системы-112, диспетчер ДДС или не задан"


def allows(user: User, mode: str) -> bool:
    if mode not in PROFILES or user.training_profile is None:
        return True
    return user.training_profile == mode


def profile_title(profile: str | None) -> str:
    return PROFILE_TITLES.get(profile or "", NO_PROFILE_TITLE)


def short_name(full_name: str) -> str:
    """«Иванов Сергей Петрович» → «Иванов С. П.»."""
    last, *rest = full_name.split()
    return " ".join([last, *(f"{part[0]}." for part in rest)])


def blocked_message(user: User, mode: str) -> str:
    return f"Задание режима {MODE_TITLES[mode]} недоступно для учётной записи {PROFILE_GENITIVE[user.training_profile]}"


def create_rejection(blocked: list[User], mode: str, what: str = "Задание") -> str:
    profiles = ", ".join(dict.fromkeys(PROFILE_GENITIVE[user.training_profile] for user in blocked))
    names = ", ".join(short_name(user.full_name) for user in blocked)
    return f"{what} режима {MODE_TITLES[mode]} нельзя назначить: профиль {profiles} — {names}"


def split_by_profile(users: Iterable[User], mode: str) -> tuple[list[User], list[User]]:
    allowed: list[User] = []
    blocked: list[User] = []
    for user in users:
        (allowed if allows(user, mode) else blocked).append(user)
    return allowed, blocked
