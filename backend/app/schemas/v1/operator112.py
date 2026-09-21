"""Схемы режима специалиста-112 и билетов (T082) по `contracts/v1-endpoints.md`: Ticket, TicketAudio, OperatorAttempt,
OperatorEvent, NotificationListResponse, CardDraft, OperatorEvaluation (= Evaluation + fieldDiff), Street.

Входные модели валидируют тела запросов (сообщения — по-русски, как в мок-слое); выходные формы собираются
сервисом как dict (camelCase 1:1), здесь они описаны для OpenAPI и тестов форм.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

Voice = Literal["male", "female", "auto"]
AudioStatus = Literal["pending", "ready", "failed"]
AttemptState = Literal["ringing", "answered", "submitted"]
EventType = Literal["fieldChanged", "signSelected", "serviceAdded", "replay", "hintShown"]
EVENT_TYPES: tuple[str, ...] = ("fieldChanged", "signSelected", "serviceAdded", "replay", "hintShown")
ADDRESS_SOURCES = ("directory", "manual")


def _clean(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


# ─── Билеты и аудио ───────────────────────────────────────────────────────────────────────────────


class TicketAudioRequest(ApiModel):
    voice: Voice = "auto"

    @field_validator("voice", mode="before")
    @classmethod
    def _voice(cls, value: Any) -> Any:
        if value in (None, ""):
            return "auto"
        if value not in ("male", "female", "auto"):
            raise ValueError("Поле «voice» — male, female или auto")
        return value


class TicketAudio(ApiModel):
    card_id: str
    status: AudioStatus
    transcript: str
    voice: str
    path: str | None = None
    duration_ms: int | None = None
    generated_at: str | None = None
    emergency: bool = False
    error: str | None = None


class TicketCreate(ApiModel):
    """`POST /tickets`: IncidentCard без id + difficulty (преподаватель)."""

    group: str
    summary: str
    address: str
    caller: dict[str, Any]
    expected_services: list[str] = Field(default_factory=list)
    expected_tags: list[str] = Field(default_factory=list)
    victims: dict[str, Any] | None = None
    no_ambulance: bool | None = None
    cross_region: bool | None = None
    address_refined: str | None = None
    difficulty: int = 1

    @field_validator("group", "summary", "address", mode="before")
    @classmethod
    def _required_text(cls, value: Any, info: Any) -> Any:
        if not _clean(value):
            titles = {"group": "группу происшествия", "summary": "фабулу", "address": "адрес"}
            raise ValueError(f"Укажите {titles.get(info.field_name, info.field_name)}")
        return _clean(value)

    @field_validator("caller", mode="before")
    @classmethod
    def _caller(cls, value: Any) -> Any:
        if not isinstance(value, dict) or not _clean(value.get("phone")):
            raise ValueError("Заявитель: укажите телефон (caller.phone)")
        return {"name": _clean(value.get("name")) or "не указан", "phone": _clean(value.get("phone")), "status": _clean(value.get("status")) or "очевидец"}

    @field_validator("difficulty", mode="before")
    @classmethod
    def _difficulty(cls, value: Any) -> Any:
        if value is None:
            return 1
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            raise ValueError("Сложность — целое число от 1 до 5")
        return value


# ─── Режим специалиста-112 ────────────────────────────────────────────────────────────────────────


class OperatorAttemptCreate(ApiModel):
    assignment_id: str
    card_id: str
    student_id: str | None = None  # преподаватель/администратор создают попытку за курсанта

    @field_validator("assignment_id", "card_id", mode="before")
    @classmethod
    def _ids(cls, value: Any, info: Any) -> Any:
        if not _clean(value):
            raise ValueError(f"Заполните поле «{'assignmentId' if info.field_name == 'assignment_id' else 'cardId'}»")
        return _clean(value)


class OperatorEventCreate(ApiModel):
    type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type", mode="before")
    @classmethod
    def _type(cls, value: Any) -> Any:
        if value not in EVENT_TYPES:
            raise ValueError("Поле «type» — fieldChanged, signSelected, serviceAdded, replay или hintShown")
        return value

    @field_validator("payload", mode="before")
    @classmethod
    def _payload(cls, value: Any) -> Any:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("Поле «payload» — объект")
        return value

    @model_validator(mode="after")
    def _shape(self) -> OperatorEventCreate:
        if self.type == "fieldChanged" and not _clean(self.payload.get("field")):
            raise ValueError("Событие fieldChanged: укажите payload.field")
        if self.type == "signSelected" and not isinstance(self.payload.get("signs"), list):
            raise ValueError("Событие signSelected: укажите payload.signs (список признаков)")
        if self.type == "serviceAdded" and not _clean(self.payload.get("serviceId")):
            raise ValueError("Событие serviceAdded: укажите payload.serviceId")
        return self


class CardDraftApplicant(ApiModel):
    name: str = ""
    status: str = ""


class CardDraftPhones(ApiModel):
    aon: str = ""
    provided: str = ""
    on_site: str = ""


class CardDraftAddress(ApiModel):
    formal: str = ""
    street: str = ""
    house: str = ""
    okrug: str = ""
    raion: str = ""
    descriptive: str = ""
    source: str = "manual"  # directory | manual — фиксация «из справочника / вручную» (FR-014)

    @field_validator("source", mode="before")
    @classmethod
    def _source(cls, value: Any) -> Any:
        return value if value in ADDRESS_SOURCES else "manual"


class CardDraftCasualties(ApiModel):
    injured: bool = False
    ambulance_refused: bool = False
    blocked: bool = False


class CardDraftWhat(ApiModel):
    poll_answers: str = ""
    signs: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    final_type: str = ""
    classifier_code: str = ""
    casualties: CardDraftCasualties = Field(default_factory=CardDraftCasualties)


class CardDraftEmergency(ApiModel):
    chs: bool = False
    chp: bool = False


class CardDraftNotification(ApiModel):
    service_id: str
    added_by: str = "auto"


class CardDraft(ApiModel):
    """Карточка ПОВ-112 с нуля (`ArmCardFixture`-подобная): заявитель, телефоны, адрес, описание, опросная карта, флаги, список."""

    applicant: CardDraftApplicant = Field(default_factory=CardDraftApplicant)
    phones: CardDraftPhones = Field(default_factory=CardDraftPhones)
    address: CardDraftAddress = Field(default_factory=CardDraftAddress)
    what: CardDraftWhat = Field(default_factory=CardDraftWhat)
    description: str = ""
    emergency: CardDraftEmergency = Field(default_factory=CardDraftEmergency)
    notification_list: list[CardDraftNotification] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value: Any) -> Any:
        text = _clean(value)
        if len(text) > 1999:
            raise ValueError("Описание со слов заявителя — до 1999 символов")
        return text

    @model_validator(mode="after")
    def _minimum(self) -> CardDraft:
        # Минимум для регистрации (памятка стр. 12–20): адрес и описание либо опросная карта.
        if not (_clean(self.address.formal) or _clean(self.address.street) or _clean(self.address.descriptive)):
            raise ValueError("Заполните адресный блок")
        if not (self.description or self.what.signs or _clean(self.what.final_type) or _clean(self.what.classifier_code)):
            raise ValueError("Заполните описание со слов заявителя или опросную карту")
        return self


class NotificationListResponse(ApiModel):
    final_type: str
    classifier_code: str
    group: str = ""
    services: list[dict[str, Any]] = Field(default_factory=list)
    conditional: list[dict[str, Any]] = Field(default_factory=list)


class Street(ApiModel):
    id: int
    name: str
    type: str = ""
    okrug: str | None = None
    raion: str | None = None


class OperatorAttempt(ApiModel):
    id: str
    card_id: str
    student_id: str
    aon: str
    incident_number: int
    created_at: str
    state: AttemptState
    answered_at: str | None = None
    completed_at: str | None = None
    assignment_id: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    replays: int = 0
    hints_shown: int = 0
    hints: dict[str, Any] | None = None
    audio: dict[str, Any] | None = None
    card_snapshot: dict[str, Any] | None = None


class OperatorEvaluation(ApiModel):
    """Evaluation фронта + fieldDiff[] (FR-040) + mode/assessorVersion/components/warnings/passed (расширения)."""

    time_score: int
    correctness_score: int
    grammar_score: int
    semantic_score: int
    total_score: int
    grammar_errors: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    ai_comment: str
    field_diff: list[dict[str, Any]] = Field(default_factory=list)
    mode: str = "operator112"
    assessor_version: str = ""
    passed: bool | None = None
