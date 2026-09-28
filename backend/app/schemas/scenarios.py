"""Схемы конструктора сценариев 1:1 с `src/shared/api/types/{scenario,teacher}.ts` и `ai-gateway.ts` (T058).

Тела запросов разбираются через `parse_body(...)`: первая ошибка Pydantic превращается в 400 `validationFailed`
с русским сообщением (тексты правил — как в моке фронта `src/shared/api/mock/scenarios.ts`, `teacher.ts`).
"""

from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.api.errors import validation_failed
from app.schemas.common import ApiModel

ScenarioLevel = Literal["beginner", "advanced"]
ScenarioSource = Literal["template", "generated"]
ScenarioMode = Literal["demo", "follow", "practice"]
ScenarioValidationStatus = Literal["draft", "pending", "approved", "rejected"]
ScenarioValidateAction = Literal["submit", "approve", "approvePartial", "reject"]
MaterialFormat = Literal["DOCX", "PDF", "MP3"]

MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5
ADVANCED_FROM_DIFFICULTY = 3  # spec/05 §6: beginner ↔ 1–2, advanced ↔ 3–5
MATERIAL_FORMATS: dict[str, MaterialFormat] = {"docx": "DOCX", "pdf": "PDF", "mp3": "MP3"}
SUPPORTED_EXTENSIONS = ", ".join(f.upper() for f in MATERIAL_FORMATS)


def to_level(difficulty: int) -> ScenarioLevel:
    return "advanced" if difficulty >= ADVANCED_FROM_DIFFICULTY else "beginner"


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _require_text(value: Any, message: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(message)
    return value.strip()


class ScenarioTimeNorms(ApiModel):
    primary_reaction_sec: float
    full_processing_sec: float

    @field_validator("primary_reaction_sec", "full_processing_sec", mode="before")
    @classmethod
    def _positive(cls, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Некорректные нормативы времени")
        if value <= 0:
            raise ValueError("Нормативы времени — положительные значения в секундах")
        return value


class ScenarioHints(ApiModel):
    enabled: bool
    texts: list[str]


class Etalon(ApiModel):
    """Эталон контракта + расширения оценщика (`cards`, `expectedDecision`, … — см. ml/assess/etalon.py) сохраняются как есть."""

    model_config = ConfigDict(alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True, extra="allow")

    expected_fields: dict[str, Any] | None = None
    expected_actions: list[str]
    expected_text: str | None = None
    key_phrases: list[str]

    @field_validator("expected_actions", mode="before")
    @classmethod
    def _actions(cls, value: Any) -> Any:
        if not isinstance(value, list) or any(not isinstance(a, str) for a in value):
            raise ValueError("Некорректный эталон: ожидаемая последовательность действий")
        return value

    @field_validator("key_phrases", mode="before")
    @classmethod
    def _phrases(cls, value: Any) -> Any:
        if not isinstance(value, list) or any(not isinstance(a, str) for a in value):
            raise ValueError("Некорректные ключевые фразы эталона")
        return value


class SuccessCriteria(ApiModel):
    max_grammar_errors: int
    required_fields: list[str]
    syntax_requirements: str

    @field_validator("max_grammar_errors", mode="before")
    @classmethod
    def _limit(cls, value: Any) -> Any:
        if not _is_int(value) or value < 0:
            raise ValueError("Порог грамматических ошибок — целое число не меньше 0")
        return value


class ScenarioValidation(ApiModel):
    status: ScenarioValidationStatus
    reviewed_by: str | None = None
    comment: str | None = None
    approved_fields: list[str] | None = None


class ScenarioBase(ApiModel):
    title: str
    level: ScenarioLevel
    source_ticket_no: int
    card_ids: list[str]
    time_norms: ScenarioTimeNorms
    hints: ScenarioHints
    call_target: str | None = None
    difficulty: int
    etalon: Etalon
    success_criteria: SuccessCriteria
    source: ScenarioSource
    mode: ScenarioMode | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: Any) -> str:
        return _require_text(value, "Укажите название сценария")

    @field_validator("difficulty", mode="before")
    @classmethod
    def _difficulty(cls, value: Any) -> Any:
        if not _is_int(value) or not (MIN_DIFFICULTY <= value <= MAX_DIFFICULTY):
            raise ValueError("Сложность — целое число от 1 до 5")
        return value

    @field_validator("source_ticket_no", mode="before")
    @classmethod
    def _ticket(cls, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Укажите номер билета-источника")
        return int(value)

    @field_validator("card_ids", mode="before")
    @classmethod
    def _cards(cls, value: Any) -> Any:
        if not isinstance(value, list) or not value or any(not isinstance(c, str) for c in value):
            raise ValueError("Добавьте карточки в сценарий")
        return value


class Scenario(ScenarioBase):
    id: str
    validation: ScenarioValidation


class ScenarioCreateRequest(ScenarioBase):
    """POST /scenarios — `Scenario` без id и validation."""


class ScenarioUpdateRequest(ApiModel):
    """PATCH /scenarios/[id] — применяются только переданные поля (`model_fields_set`)."""

    title: str | None = None
    difficulty: int | None = None
    level: ScenarioLevel | None = None
    mode: ScenarioMode | None = None
    time_norms: ScenarioTimeNorms | None = None
    etalon: Etalon | None = None
    success_criteria: SuccessCriteria | None = None
    updated_by: str

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: Any) -> str:
        return _require_text(value, "Укажите название сценария")

    @field_validator("difficulty", mode="before")
    @classmethod
    def _difficulty(cls, value: Any) -> Any:
        if not _is_int(value) or not (MIN_DIFFICULTY <= value <= MAX_DIFFICULTY):
            raise ValueError("Сложность — целое число от 1 до 5")
        return value

    @field_validator("level", mode="before")
    @classmethod
    def _level(cls, value: Any) -> Any:
        if value not in ("beginner", "advanced"):
            raise ValueError("Некорректный уровень сценария")
        return value

    @field_validator("mode", mode="before")
    @classmethod
    def _mode(cls, value: Any) -> Any:
        if value not in ("demo", "follow", "practice"):
            raise ValueError("Некорректный режим сценария")
        return value

    @field_validator("time_norms", mode="before")
    @classmethod
    def _norms(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            raise ValueError("Некорректные нормативы времени")
        return value

    @field_validator("etalon", mode="before")
    @classmethod
    def _etalon(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            raise ValueError("Некорректный эталон: ожидаемая последовательность действий")
        return value

    @field_validator("success_criteria", mode="before")
    @classmethod
    def _criteria(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            raise ValueError("Некорректные критерии успешности")
        return value


class ScenarioValidateRequest(ApiModel):
    action: ScenarioValidateAction
    reviewed_by: str
    comment: str | None = None
    fields: list[str] | None = None

    @field_validator("action", mode="before")
    @classmethod
    def _action(cls, value: Any) -> Any:
        if value not in ("submit", "approve", "approvePartial", "reject"):
            raise ValueError("Некорректное действие валидации")
        return value

    @field_validator("comment", mode="before")
    @classmethod
    def _comment(cls, value: Any) -> Any:
        if value is not None and not isinstance(value, str):
            raise ValueError("Комментарий должен быть строкой")
        return value


class ScenarioGenerateRequest(ApiModel):
    category: str
    requested_by: str

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, value: Any) -> str:
        return _require_text(value, "Выберите категорию событий (группу ЕКП)")


class TrainingMaterial(ApiModel):
    id: str
    name: str
    format: MaterialFormat
    size_bytes: int
    uploaded_by: str
    uploaded_at: str


class MaterialUploadRequest(ApiModel):
    name: str
    size_bytes: int | None = None
    uploaded_by: str

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: Any) -> str:
        return _require_text(value, "Укажите имя файла материала")

    @field_validator("size_bytes", mode="before")
    @classmethod
    def _size(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            raise ValueError("Размер файла — неотрицательное число байт")
        return int(value)

    @property
    def resolved_format(self) -> MaterialFormat | None:
        extension = self.name.lower().rsplit(".", 1)[-1] if "." in self.name else ""
        return MATERIAL_FORMATS.get(extension)


class ProfileMappingRow(ApiModel):
    id: str
    profile: str
    group_name: str | None = None
    incident_groups: list[str]
    service_ids: list[str]
    student_count: int


class ProfileMappingRowInput(ApiModel):
    id: str
    incident_groups: list[str]


class ProfileMappingSaveRequest(ApiModel):
    rows: list[ProfileMappingRowInput]
    saved_by: str


class GrammarCheckRequest(ApiModel):
    text: str
    field: str | None = None
    # US3: необязательная привязка замечаний к сценарию и его текущей версии (прежние вызовы без неё не меняются).
    scenario_id: str | None = None
    scenario_version: int | None = None

    @field_validator("text", mode="before")
    @classmethod
    def _text(cls, value: Any) -> Any:
        if not isinstance(value, str):
            raise ValueError("Передайте текст для проверки грамматики")
        return value

    @field_validator("scenario_id", mode="before")
    @classmethod
    def _scenario_id(cls, value: Any) -> Any:
        if value is not None and (not isinstance(value, str) or not value.strip()):
            raise ValueError("scenarioId — идентификатор сценария")
        return value.strip() if isinstance(value, str) else value

    @field_validator("scenario_version", mode="before")
    @classmethod
    def _scenario_version(cls, value: Any) -> Any:
        if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 1):
            raise ValueError("scenarioVersion — целое число от 1")
        return value


class GrammarError(ApiModel):
    field: str
    fragment: str
    wrong: str
    expected: str
    type: Literal["spelling", "syntax"]
    scenario_id: str | None = None
    scenario_version: int | None = None


class ValidationCheck(ApiModel):
    id: str
    passed: bool
    message: str
    needs_review: bool = False
    confidence: float | None = None
    available: bool = True
    details: dict[str, Any] = Field(default_factory=dict)


class ValidationReport(ApiModel):
    version: str
    passed: bool
    needs_review: bool
    checks: list[ValidationCheck]


T = TypeVar("T")


class AiResponse(BaseModel, Generic[T]):
    """Ответ ИИ-модуля с маркером происхождения (бейдж «ИИ» в UI); бэкенд — `provider: service`."""

    origin: Literal["ai"] = "ai"
    provider: Literal["mock", "service"] = "service"
    data: T


def ai_response(data: Any) -> dict[str, Any]:
    return {"origin": "ai", "provider": "service", "data": data}


def parse_body(model: type[ApiModel], body: dict[str, Any]) -> Any:
    """Разбор тела запроса; первая ошибка → 400 validationFailed с сообщением правила или полем."""
    try:
        return model.model_validate(body)
    except ValidationError as exc:
        first = exc.errors()[0]
        message = str(first.get("msg", ""))
        if first.get("type") == "value_error":
            raise validation_failed(message.removeprefix("Value error, ")) from exc
        location = ".".join(str(part) for part in first.get("loc", ()))
        if first.get("type") == "missing":
            raise validation_failed(f"Заполните поле «{location}»") from exc
        raise validation_failed(f"Некорректное значение поля «{location or 'тело запроса'}»") from exc
