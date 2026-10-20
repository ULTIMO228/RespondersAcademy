from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import BigInteger, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONVariant

# Специализация обучающегося (фича 019): словарь совпадает с режимами заданий (`training_mode`), новый не вводится.
SPECIALIZATIONS: tuple[str, ...] = ("operator112", "dds")
SPECIALIZATION_TITLES: dict[str, str] = {"operator112": "Специалист 112", "dds": "Оператор ДДС"}
# Какие специализации нужны режиму: «цепочка» требует обе (допущение 3 спеки 019).
MODE_SPECIALIZATIONS: dict[str, tuple[str, ...]] = {
    "operator112": ("operator112",),
    "dds": ("dds",),
    "chain": ("operator112", "dds"),
}
MODE_TITLES: dict[str, str] = {"operator112": "специалист 112", "dds": "оператор ДДС", "chain": "цепочка 112 → ДДС"}
# Старые учётные записи обучающихся без поля — «оператор ДДС» (фактическое поведение до фичи 019, допущение 10).
DEFAULT_STUDENT_SPECIALIZATIONS: tuple[str, ...] = ("dds",)


def required_specializations(mode: str) -> tuple[str, ...]:
    try:
        return MODE_SPECIALIZATIONS[mode]
    except KeyError as exc:
        raise ValueError(f"Неизвестный режим: {mode}") from exc


def covers_mode(specializations: Iterable[str] | None, mode: str) -> bool:
    """Есть ли у обучающегося все специализации, которых требует режим."""
    owned = set(specializations or ())
    return all(item in owned for item in required_specializations(mode))


def normalize_specializations(role: str, value: object) -> list[str] | None:
    """Проверка значения поля по роли: обучающийся — непустой список без дублей из словаря; учитель и администратор — NULL."""
    if role != "student":
        if value is None or value == []:
            return None
        raise ValueError("Специализация назначается только обучающимся")
    if not isinstance(value, list) or not value:
        raise ValueError("Укажите хотя бы одну специализацию: «Специалист 112» и/или «Оператор ДДС»")
    unknown = [item for item in value if not isinstance(item, str) or item not in SPECIALIZATIONS]
    if unknown:
        raise ValueError(f"Недопустимая специализация: {unknown[0]}")
    if len(set(value)) != len(value):
        raise ValueError("Специализация не должна повторяться")
    return list(value)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(16), index=True)
    arm_number: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    service: Mapped[str | None] = mapped_column(String(160), nullable=True)
    assigned_groups: Mapped[list[str] | None] = mapped_column(JSONVariant, nullable=True)
    specializations: Mapped[list[str] | None] = mapped_column(JSONVariant, nullable=True)
    permissions: Mapped[list[str] | None] = mapped_column(JSONVariant, nullable=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    def to_public(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "login": self.login,
            "fullName": self.full_name,
            "role": self.role,
            "armNumber": self.arm_number,
            "isActive": self.is_active,
        }
        if self.group:
            data["group"] = self.group
        if self.service:
            data["service"] = self.service
        if self.assigned_groups:
            data["assignedGroups"] = list(self.assigned_groups)
        if self.specializations:
            data["specializations"] = list(self.specializations)
        return data
