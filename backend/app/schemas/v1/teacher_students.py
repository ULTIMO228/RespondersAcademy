"""Запросы преподавателя к профилю обучающегося."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, field_validator

from app.schemas.common import ApiModel


class SpecializationsPatch(ApiModel):
    model_config = ConfigDict(alias_generator=None, populate_by_name=True, extra="forbid")

    specializations: list[Literal["operator112", "dds"]]

    @field_validator("specializations")
    @classmethod
    def validate_specializations(cls, values: list[str]) -> list[str]:
        if not values:
            raise ValueError("Укажите хотя бы одну специализацию")
        if len(set(values)) != len(values):
            raise ValueError("Специализация не должна повторяться")
        return values
