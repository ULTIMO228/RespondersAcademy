"""Data-driven машина статусных графов — порт src/shared/lib/status-machine (граф только из справочника)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.api.errors import ApiError, invalid_transition, validation_failed

PRIMARY_DDS_STATUSES = ("accepted", "notAccepted")


class StatusTransitionError(Exception):
    def __init__(self, code: str, message: str, source: str | None, target: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.source = source
        self.target = target

    def to_api_error(self) -> ApiError:
        if self.code == "invalidTransition":
            return invalid_transition(self.message)
        return validation_failed(self.message)


def _quote_titles(titles: list[str]) -> str:
    return "нет" if not titles else ", ".join(f"«{title}»" for title in titles)


@dataclass
class StatusMachine:
    defs: list[dict[str, Any]]
    initial: tuple[str, ...] | None = None

    def __post_init__(self) -> None:
        self.by_status = {str(d["status"]): d for d in self.defs}
        if self.initial is None:
            targets = {t for d in self.defs for t in d.get("next", [])}
            self.initial_statuses = [str(d["status"]) for d in self.defs if d["status"] not in targets]
        else:
            self.initial_statuses = [s for s in self.initial if s in self.by_status]

    @property
    def statuses(self) -> list[str]:
        return [str(d["status"]) for d in self.defs]

    def has_status(self, status: str) -> bool:
        return status in self.by_status

    def title(self, status: str) -> str:
        return str(self.by_status.get(status, {}).get("title", status))

    def requires_comment(self, status: str) -> bool:
        return bool(self.by_status.get(status, {}).get("requiresComment", False))

    def next_statuses(self, current: str | None) -> list[str]:
        if current is None:
            return list(self.initial_statuses)
        return [str(s) for s in self.by_status.get(current, {}).get("next", [])]

    def is_final(self, status: str) -> bool:
        return self.has_status(status) and not self.next_statuses(status)

    def can_transition(self, source: str | None, target: str) -> bool:
        return self.has_status(target) and target in self.next_statuses(source)

    def assert_transition(self, source: str | None, target: str, comment: str | None = None) -> None:
        for status in (source, target):
            if status is not None and not self.has_status(status):
                raise StatusTransitionError("unknownStatus", f"Неизвестный статус «{status}»", source, target)
        allowed = self.next_statuses(source)
        if target not in allowed:
            from_text = "Первичный статус" if source is None else f"Переход из «{self.title(source)}»"
            message = f"{from_text} в «{self.title(target)}» недопустим. Доступно: {_quote_titles([self.title(s) for s in allowed])}"
            raise StatusTransitionError("invalidTransition", message, source, target)
        if self.requires_comment(target) and not (isinstance(comment, str) and comment.strip()):
            raise StatusTransitionError("commentRequired", f"Для статуса «{self.title(target)}» обязателен комментарий", source, target)


def dds_machine(dds_statuses: list[dict[str, Any]]) -> StatusMachine:
    return StatusMachine(dds_statuses, initial=PRIMARY_DDS_STATUSES)
