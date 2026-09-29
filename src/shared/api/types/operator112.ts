/*
 * Режим «Специалист-112» — контракт /api/v1 (спека 002; бэкенд: backend/app/schemas/v1/operator112.py,
 * сборка ответа — Attempt.to_operator_contract и services/operator112_service.py). Формы 1:1 с бэкендом.
 * Попытка по id не читается (GET /operator112/attempts/{id} нет): выдача и восстановление — assignments.startAssignment.
 */

export type OperatorAttemptState = "ringing" | "answered" | "submitted";
/** Типы событий, которые отправляет клиент (POST …/events); иное сервер отклоняет 400. */
export type OperatorEventType = "fieldChanged" | "signSelected" | "serviceAdded" | "replay" | "hintShown";
/** Событие в ленте попытки: клиентские типы + answerTimeout, который сервер пишет сам при ответе позже норматива. */
export type OperatorEventKind = OperatorEventType | "answerTimeout";
export type TicketAudioStatus = "pending" | "ready" | "failed";
export type AddressSource = "directory" | "manual";
export type NotificationAdder = "auto" | "manual";

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

/** Карточка, которую специалист-112 передаёт (submit). Минимум: адресный блок + описание или опросная карта. */
export interface CardDraft {
  applicant: CardDraftApplicant;
  phones: CardDraftPhones;
  address: CardDraftAddress;
  what: CardDraftWhat;
  description: string;
  emergency: CardDraftEmergency;
  notificationList: CardDraftNotification[];
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
  fieldDiff: FieldDiff[];
  mode: string;
  assessorVersion: string;
  passed?: boolean;
}
