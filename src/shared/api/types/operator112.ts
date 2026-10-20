/*
 * Режим «Специалист-112» — контракт /api/v1 (спека 002; бэкенд: backend/app/schemas/v1/operator112.py,
 * сборка ответа — Attempt.to_operator_contract и services/operator112_service.py). Формы 1:1 с бэкендом.
 * Попытка по id не читается (GET /operator112/attempts/{id} нет): выдача и восстановление — assignments.startAssignment.
 */
import type { AiServedBy } from "./ai-settings";

export type OperatorAttemptState = "ringing" | "answered" | "submitted";
/**
 * Типы событий, которые отправляет клиент (POST …/events); иное сервер отклоняет 400.
 * Спека 009: вкладки типов, ручное удаление службы, связи карточек, скрытие окна вызова «×».
 * Фича 007: исходы звонка «нет контакта» / «срыв звонка», статусы сохранённой карточки «Отработана» / «Закрыть».
 */
export type OperatorEventType =
  | "fieldChanged"
  | "signSelected"
  | "serviceAdded"
  | "replay"
  | "hintShown"
  | "typeAdded"
  | "typeRemoved"
  | "serviceRemoved"
  | "linkAdded"
  | "linkRemoved"
  | "linkPrimary"
  | "callHidden"
  | "noContact"
  | "callDropped"
  | "processed"
  | "close";
/**
 * Событие в ленте попытки: клиентские типы + answerTimeout, который сервер пишет сам при ответе позже норматива,
 * и save — фиксация сохранения карточки (фича 007).
 */
export type OperatorEventKind = OperatorEventType | "answerTimeout" | "save";
export type TicketAudioStatus = "pending" | "ready" | "failed";
export type AddressSource = "directory" | "manual";
export type NotificationAdder = "auto" | "manual";
/** Канал поступления обращения (спека 009): звонок или СМС. */
export type CardChannel = "call" | "sms";
/** Исход карточки: заполнена или сохранена пустой кнопками «нет контакта» / «срыв звонка» (007, FR-017). */
export type CardOutcome = "filled" | "noContact" | "dropped";

/** Запись речи заявителя. emergency — файла нет, работать по transcript (аварийный текстовый режим). */
export interface TicketAudio {
  cardId: string;
  status: TicketAudioStatus;
  transcript: string;
  voice: string;
  path?: string;
  durationMs?: number;
  generatedAt?: string;
  emergency: boolean;
  error?: string;
}

/** Ручное событие попытки; время проставляет сервер. */
export interface OperatorEvent {
  id: string;
  type: OperatorEventKind;
  at: string;
  payload: Record<string, unknown>;
  /** Значение поля до правки (только fieldChanged). */
  before?: unknown;
}

export interface OperatorEventRequest {
  type: OperatorEventType;
  /** fieldChanged: { field, value }; signSelected: { signs }; serviceAdded: { serviceId }. */
  payload?: Record<string, unknown>;
}

export interface OperatorHintStep {
  stage: string;
  text: string;
}

export interface OperatorHints {
  enabled: boolean;
  idleSec: number;
  steps: OperatorHintStep[];
}

export interface OperatorAttempt {
  id: string;
  cardId: string;
  studentId: string;
  aon: string;
  incidentNumber: number;
  createdAt: string;
  /** Поступление вызова: начало отсчёта норматива ответа и лимита экзамена. */
  openedAt: string;
  state: OperatorAttemptState;
  answeredAt?: string;
  completedAt?: string;
  assignmentId?: string;
  events: OperatorEvent[];
  replays: number;
  hintsShown: number;
  hints?: OperatorHints;
  audio?: TicketAudio;
  cardSnapshot?: Record<string, unknown>;
  /* Поля билета (спека 009, FR-010, US5/US6): канал по умолчанию «звонок»; текст СМС — только у канала sms. */
  channel?: CardChannel;
  smsText?: string;
  /** id карточки журнала, к которой привязан повторный вызов (билет с repeatOf). */
  repeatOf?: string;
}

export interface CardDraftApplicant {
  name: string;
  status: string;
}

export interface CardDraftPhones {
  aon: string;
  provided: string;
  onSite: string;
}

export interface CardDraftAddress {
  formal: string;
  street: string;
  house: string;
  okrug: string;
  raion: string;
  descriptive: string;
  source: AddressSource;
  /* Адрес любого субъекта (спека 009, FR-014, FR-023): необязательные, старые карточки их не содержат. */
  country?: string;
  subject?: string;
  locality?: string;
  object?: string;
  korpus?: string;
  /** «Стр/соор». */
  building?: string;
  /** «Квартира/офис». */
  flat?: string;
  entrance?: string;
  floor?: string;
  code?: string;
  lat?: number;
  lon?: number;
}

export interface CardDraftCasualties {
  injured: boolean;
  ambulanceRefused: boolean;
  blocked: boolean;
}

export interface CardDraftWhat {
  pollAnswers: string;
  signs: string[];
  flags: string[];
  finalType: string;
  classifierCode: string;
  casualties: CardDraftCasualties;
}

export interface CardDraftEmergency {
  chs: boolean;
  chp: boolean;
}

export interface CardDraftNotification {
  serviceId: string;
  addedBy: NotificationAdder;
}

/** Связь карточек (спека 009, US5): ровно одна главная, если связи есть. */
export interface CardDraftLink {
  cardId: string;
  primary: boolean;
}

/**
 * Карточка, которую специалист-112 сохраняет (submit). Минимум: адресный блок + описание или опросная карта;
 * при outcome «noContact» / «dropped» — без минимума. what = первая вкладка incidents (её читает оценщик).
 */
export interface CardDraft {
  applicant: CardDraftApplicant;
  phones: CardDraftPhones;
  address: CardDraftAddress;
  what: CardDraftWhat;
  description: string;
  emergency: CardDraftEmergency;
  notificationList: CardDraftNotification[];
  channel?: CardChannel;
  /** Вкладки «Происшествие …» по порядку (спека 009, FR-017). */
  incidents?: CardDraftWhat[];
  links?: CardDraftLink[];
  outcome?: CardOutcome;
  /**
   * Список оповещения подтверждён в окне «Подтвердите оповещение служб» (фича 007). Без него сервер не сохраняет
   * заполненную карточку (409); для исходов «noContact» / «dropped» не требуется. Нет поля — сервер читает false.
   */
  notificationConfirmed?: boolean;
}

/** Строка журнала специалиста-112 (спека 009, FR-006, FR-007): фон задания, свои карточки ученика, ожидающий вызов. */
export interface Journal112Row {
  cardId: string;
  number: string;
  createdAt: string;
  operator: string;
  arm: string;
  whatHappened: string;
  injured: string;
  status: string;
  address: string;
  description: string;
  linked: boolean;
  chs: boolean;
  checked: boolean;
  isOwn: boolean;
  lockedBy?: { operator: number; name: string; arm: number };
  /** Вызов попытки ещё не принят (окно закрыто «×» или ещё не показано). */
  queued?: boolean;
}

export interface Journal112Response {
  rows: Journal112Row[];
  total: number;
}

/** Совпадения вызова с карточками журнала (спека 009, US5): пустой matches — окно «Есть карточка…» не показывается. */
export interface Journal112MatchesResponse {
  matches: Journal112Row[];
}

/** Служба списка оповещения (обязательная — services, условная — conditional). */
export interface NotificationListItem {
  serviceId: string;
  addedBy: NotificationAdder;
  title: string;
  mode?: string;
  condition?: string;
}

export interface NotificationListResponse {
  finalType: string;
  classifierCode: string;
  group: string;
  services: NotificationListItem[];
  conditional: NotificationListItem[];
}

export interface NotificationListPreview {
  signs?: readonly string[];
  classifierCode?: string;
}

export interface Street {
  id: number;
  name: string;
  type: string;
  okrug?: string;
  raion?: string;
}

/** Различие введённого значения поля с эталоном билета. */
export interface FieldDiff {
  field: string;
  entered: unknown;
  expected: unknown;
  ok: boolean;
}

/** Evaluation фронта + fieldDiff; passed — только у экзамена с порогом. */
export interface OperatorEvaluation {
  timeScore: number;
  correctnessScore: number;
  grammarScore: number;
  semanticScore: number;
  totalScore: number;
  grammarErrors: Record<string, unknown>[];
  errors: Record<string, unknown>[];
  aiComment: string;
  /** Источник поясняющего текста; старые данные читаются как шаблон. */
  aiCommentSource?: AiServedBy;
  fieldDiff: FieldDiff[];
  mode: string;
  assessorVersion: string;
  passed?: boolean;
}
