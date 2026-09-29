"""Схемы администрирования 1:1 с `src/shared/api/types/{admin,user}.ts` (T068).

Тексты правил — как в моке `mock/admin-users.ts` и `validation/settings.ts` (нормативы ТЗ §7, §9):
разбор через `parse_body` → 400 `validationFailed`; нормативы настроек проверяет `validate_settings_patch` → 422.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import field_validator

from app.schemas.common import ApiModel

Role = Literal["student", "teacher", "admin"]
ROLES: tuple[str, ...] = ("student", "teacher", "admin")
ADMIN_USER_STATES: tuple[str, ...] = ("active", "blocked")
ROLE_TITLE = {"student": "Обучающийся", "teacher": "Преподаватель", "admin": "Администратор"}

LOGIN_PATTERN = re.compile(r"^[a-z][a-z0-9._-]*$", re.IGNORECASE)
LOGIN_MESSAGE = "Логин — латиница без пробелов (допустимы цифры, «.», «_», «-»)"
LOGIN_TAKEN_MESSAGE = "Логин уже занят"
SELF_BLOCK_MESSAGE = "Нельзя заблокировать собственную учётную запись"
ADMIN_ONLY_MESSAGE = "Действие доступно только администратору"

SERVICE_ACTIONS: tuple[str, ...] = ("start", "stop", "restart")
LOG_LEVELS: tuple[str, ...] = ("INFO", "WARN", "ERROR")
USAGE_PERIODS: tuple[str, ...] = ("week", "month")
AUDIT_EVENT_TYPES: tuple[str, ...] = ("login", "users", "grades", "settings", "backup", "card", "content")
AUDIT_TYPE_BY_PREFIX = {
    "auth": "login",
    "user": "users",
    "evaluation": "grades",
    "report": "grades",
    "settings": "settings",
    "service": "settings",
    "backup": "backup",
    "card": "card",
    "scenario": "content",
    "assignment": "content",
    "ticket": "content",
    "material": "content",
    "profileMapping": "content",
    "kb": "content",
    "ai": "content",
}
AUDIT_ACTION_TITLES = {
    "auth.login": "Вход в систему",
    "auth.logout": "Выход из системы",
    "auth.logoutAll": "Выход на всех устройствах",
    "auth.passwordChange": "Смена пароля",
    "user.create": "Создана учётная запись",
    "user.update": "Изменена учётная запись",
    "user.roleChange": "Смена роли",
    "user.block": "Блокировка учётной записи",
    "user.unblock": "Разблокировка учётной записи",
    "user.passwordReset": "Сброс пароля",
    "evaluation.override": "Оценка изменена преподавателем",
    "report.feedback": "Обратная связь по отчёту",
    "settings.update": "Смена настроек",
    "service.action": "Управление сервисом",
    "backup.run": "Резервное копирование",
    "card.registered": "Зарегистрирована",
    "card.processed": "Отработана",
    "card.checked": "Проверена",
    "card.notNotified": "Переход в Не оповещено",
    "card.notCompleted": "Переход в Не завершено",
    "card.refused": "Переход в Отказ",
    "card.violationsFixed": "Нарушения исправлены",
    "scenario.create": "Создан сценарий",
    "ticket.create": "Создан билет",
    "scenario.update": "Изменён сценарий",
    "scenario.delete": "Удалён сценарий",
    "scenario.generate": "Сгенерированы сценарии (ИИ)",
    "scenario.validate": "Проверка сценария",
    "material.upload": "Загружен учебный материал",
    "assignment.create": "Создано задание",
    "assignment.start": "Выдан билет задания",
    "assignment.finish": "Задание завершено",
    "profileMapping.save": "Привязка профильных категорий",
    "kb.update": "Правка статьи справочника",
    "ai.scenario.drafts": "Черновики сценариев (ИИ)",
    "ai.scenario.revise": "Сценарий пересмотрен (ИИ)",
    "ai.scenario.approve": "Сценарий утверждён",
}


def resolve_audit_type(action: str) -> str | None:
    return AUDIT_TYPE_BY_PREFIX.get(action.split(".", 1)[0])


def describe_audit_action(action: str) -> str:
    return AUDIT_ACTION_TITLES.get(action, action)


# ─── Пользователи ─────────────────────────────────────────────────────────────────────────────────


def read_full_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Укажите ФИО")
    return value.strip()


def read_login(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Укажите логин")
    login = value.strip()
    if not LOGIN_PATTERN.match(login):
        raise ValueError(LOGIN_MESSAGE)
    return login


def read_arm_number(value: Any) -> int:
    parsed: Any = value
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
        except ValueError:
            parsed = None
    if isinstance(parsed, bool) or not isinstance(parsed, int | float) or parsed != int(parsed) or parsed <= 0:
        raise ValueError("Номер АРМ — целое число больше нуля")
    return int(parsed)


def read_role(value: Any) -> str:
    if not isinstance(value, str) or value not in ROLES:
        raise ValueError(f"Некорректная роль: {value}")
    return value


def read_optional_text(value: Any, field: str) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"Некорректное значение поля «{field}»")
    return value.strip() or None


def read_group_list(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or any(not isinstance(entry, str) for entry in value):
        raise ValueError("«Закреплённые группы» — список названий групп")
    groups = [entry.strip() for entry in value if entry.strip()]
    return groups or None


class AdminUserActionRequest(ApiModel):
    admin_id: str | None = None

    @field_validator("admin_id", mode="before")
    @classmethod
    def _admin(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class AdminUserCreateRequest(AdminUserActionRequest):
    full_name: str
    login: str
    password: str
    role: str
    arm_number: int
    group: str | None = None
    service: str | None = None
    assigned_groups: list[str] | None = None

    @field_validator("full_name", mode="before")
    @classmethod
    def _full_name(cls, value: Any) -> Any:
        return read_full_name(value)

    @field_validator("login", mode="before")
    @classmethod
    def _login(cls, value: Any) -> Any:
        return read_login(value)

    @field_validator("password", mode="before")
    @classmethod
    def _password(cls, value: Any) -> Any:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Укажите временный пароль")
        return value

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, value: Any) -> Any:
        return read_role(value)

    @field_validator("arm_number", mode="before")
    @classmethod
    def _arm(cls, value: Any) -> Any:
        return read_arm_number(value)

    @field_validator("group", mode="before")
    @classmethod
    def _group(cls, value: Any) -> Any:
        return read_optional_text(value, "группа")

    @field_validator("service", mode="before")
    @classmethod
    def _service(cls, value: Any) -> Any:
        return read_optional_text(value, "служба")

    @field_validator("assigned_groups", mode="before")
    @classmethod
    def _assigned(cls, value: Any) -> Any:
        return read_group_list(value)


class AdminUserUpdateRequest(AdminUserActionRequest):
    """Не переданное поле сохраняет прежнее значение (семантика PATCH мока)."""

    full_name: str | None = None
    login: str | None = None
    arm_number: int | None = None
    role: str | None = None
    group: str | None = None
    service: str | None = None
    assigned_groups: list[str] | None = None

    @field_validator("full_name", mode="before")
    @classmethod
    def _full_name(cls, value: Any) -> Any:
        return None if value is None else read_full_name(value)

    @field_validator("login", mode="before")
    @classmethod
    def _login(cls, value: Any) -> Any:
        return None if value is None else read_login(value)

    @field_validator("arm_number", mode="before")
    @classmethod
    def _arm(cls, value: Any) -> Any:
        return None if value is None else read_arm_number(value)

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, value: Any) -> Any:
        return None if value is None else read_role(value)

    @field_validator("group", mode="before")
    @classmethod
    def _group(cls, value: Any) -> Any:
        return read_optional_text(value, "группа")

    @field_validator("service", mode="before")
    @classmethod
    def _service(cls, value: Any) -> Any:
        return read_optional_text(value, "служба")

    @field_validator("assigned_groups", mode="before")
    @classmethod
    def _assigned(cls, value: Any) -> Any:
        return read_group_list(value)


# ─── Система ──────────────────────────────────────────────────────────────────────────────────────


class SystemServiceActionRequest(ApiModel):
    action: str
    admin_id: str | None = None

    @field_validator("action", mode="before")
    @classmethod
    def _action(cls, value: Any) -> Any:
        if not isinstance(value, str) or value not in SERVICE_ACTIONS:
            raise ValueError(f"Некорректное действие над сервисом: «{value}». Допустимо: start, stop, restart")
        return value

    @field_validator("admin_id", mode="before")
    @classmethod
    def _admin(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else None


SETTINGS_SECTIONS: tuple[str, ...] = ("telephony", "backup", "logging", "security", "performance", "autoRecovery")
READ_ONLY_SECTIONS: tuple[str, ...] = ("database",)

# Нормативы ТЗ (validation/settings.ts): нарушение — 422.
NORMS = {"backupMaxPeriodHours": 24, "loggingMinRetentionMonths": 6, "sessionLimitMin": 20, "responseMaxSec": 2}
LIMITS = {
    "backupMinPeriodHours": 1,
    "loggingMaxRetentionMonths": 60,
    "sessionLimitMax": 100,
    "refreshMinSec": 1,
    "refreshMaxSec": 60,
    "bufferMinRecords": 50,
    "bufferMaxRecords": 5000,
    "passwordMinLength": 6,
    "passwordMaxLength": 64,
    "lockAttemptsMin": 1,
    "lockAttemptsMax": 10,
    "recoveryAttemptsMin": 1,
    "recoveryAttemptsMax": 5,
}
SETTINGS_MESSAGES = {
    "backupPeriod": f"Резервное копирование — не реже 1 раза в сутки: период от {LIMITS['backupMinPeriodHours']} до {NORMS['backupMaxPeriodHours']} ч (ТЗ §9)",
    "loggingRetention": f"Срок хранения журналов — не менее {NORMS['loggingMinRetentionMonths']} месяцев (ТЗ §9)",
    "loggingLevel": "Уровень логов: INFO, WARN или ERROR",
    "sessionLimit": f"Не менее {NORMS['sessionLimitMin']} одновременных сессий (ТЗ §7); допустимо до {LIMITS['sessionLimitMax']}",
    "refreshInterval": f"Интервал опроса ленты — от {LIMITS['refreshMinSec']} до {LIMITS['refreshMaxSec']} сек",
    "inputBuffer": f"Буфер ввода — от {LIMITS['bufferMinRecords']} до {LIMITS['bufferMaxRecords']} записей",
    "passwordLength": f"Минимальная длина пароля — от {LIMITS['passwordMinLength']} до {LIMITS['passwordMaxLength']} символов",
    "lockAttempts": f"Блокировка после {LIMITS['lockAttemptsMin']}–{LIMITS['lockAttemptsMax']} неудачных попыток",
    "recoveryAttempts": f"Число попыток автовосстановления — от {LIMITS['recoveryAttemptsMin']} до {LIMITS['recoveryAttemptsMax']}",
    "sipServer": "SIP-сервер: имя хоста, при необходимости с портом (например, sip.arm112.local:5060)",
    "realm": "Realm: доменное имя учебного контура (например, arm112.local)",
}
HOST_PATTERN = re.compile(r"^[a-z0-9.-]+(:\d{2,5})?$", re.IGNORECASE)


def read_settings_patch(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Секции патча; `database` и неизвестные ключи отбрасываются (read-only, 21-admin-system.md §3)."""
    return {key: dict(body[key]) for key in SETTINGS_SECTIONS if isinstance(body.get(key), dict)}


def _check_int(errors: list[dict[str, str]], field: str, value: Any, minimum: int, maximum: int, message: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, int | float) or value != int(value) or not minimum <= value <= maximum:
        errors.append({"field": field, "message": message})


def _check_host(errors: list[dict[str, str]], field: str, value: Any, message: str) -> None:
    if value is None:
        return
    if not isinstance(value, str) or not HOST_PATTERN.match(value.strip()):
        errors.append({"field": field, "message": message})


def validate_settings_patch(patch: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    """Ошибки полей патча (`{ field, message }`); пустой список — патч допустим."""
    errors: list[dict[str, str]] = []
    telephony, backup, logging = patch.get("telephony", {}), patch.get("backup", {}), patch.get("logging", {})
    security, performance, recovery = patch.get("security", {}), patch.get("performance", {}), patch.get("autoRecovery", {})
    if "require2fa" in security:
        errors.append({"field": "security.require2fa", "message": "2FA не поддерживается в локальном контуре"})
    _check_host(errors, "telephony.sipServer", telephony.get("sipServer"), SETTINGS_MESSAGES["sipServer"])
    _check_host(errors, "telephony.realm", telephony.get("realm"), SETTINGS_MESSAGES["realm"])
    _check_int(errors, "backup.periodHours", backup.get("periodHours"), LIMITS["backupMinPeriodHours"], NORMS["backupMaxPeriodHours"], SETTINGS_MESSAGES["backupPeriod"])
    _check_int(errors, "logging.retentionMonths", logging.get("retentionMonths"), NORMS["loggingMinRetentionMonths"], LIMITS["loggingMaxRetentionMonths"], SETTINGS_MESSAGES["loggingRetention"])
    if logging.get("level") is not None and logging.get("level") not in LOG_LEVELS:
        errors.append({"field": "logging.level", "message": SETTINGS_MESSAGES["loggingLevel"]})
    _check_int(errors, "performance.sessionLimit", performance.get("sessionLimit"), NORMS["sessionLimitMin"], LIMITS["sessionLimitMax"], SETTINGS_MESSAGES["sessionLimit"])
    _check_int(errors, "performance.refreshIntervalSec", performance.get("refreshIntervalSec"), LIMITS["refreshMinSec"], LIMITS["refreshMaxSec"], SETTINGS_MESSAGES["refreshInterval"])
    _check_int(errors, "performance.inputBufferRecords", performance.get("inputBufferRecords"), LIMITS["bufferMinRecords"], LIMITS["bufferMaxRecords"], SETTINGS_MESSAGES["inputBuffer"])
    _check_int(errors, "security.minPasswordLength", security.get("minPasswordLength"), LIMITS["passwordMinLength"], LIMITS["passwordMaxLength"], SETTINGS_MESSAGES["passwordLength"])
    _check_int(errors, "security.lockAfterAttempts", security.get("lockAfterAttempts"), LIMITS["lockAttemptsMin"], LIMITS["lockAttemptsMax"], SETTINGS_MESSAGES["lockAttempts"])
    _check_int(errors, "autoRecovery.restartAttempts", recovery.get("restartAttempts"), LIMITS["recoveryAttemptsMin"], LIMITS["recoveryAttemptsMax"], SETTINGS_MESSAGES["recoveryAttempts"])
    return errors
