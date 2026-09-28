/*
 * Рабочая карточка ПОВ-112 (UI-фикстура) — spec/000-фронт/05-data-models.md §5 (mocks/fixtures/arm-cards.json, 12 шт.).
 * Пространство id: "card-NNNNNN". НЕ путать с учебной IncidentCard ("c-NNN").
 */
import type { CardStatus, ServiceStatus } from "./reference";

/** Id UI-фикстуры: "card-*". */
export type ArmCardId = string;

export interface WorkLine {
  operator: string;
  at: string;
  service: string;
  calledTo: string;
  person: string;
  message: string;
}

export interface ServiceStatusEvent {
  status: ServiceStatus;
  at: string;
  /** "оп. 14" / ФИО / "оп. 9999" (у ВИС всегда оп. 9999). */
  actor: string;
  /** Обязателен для notAccepted. */
  comment?: string;
}

export type NotificationAddedBy = "auto" | "manual" | "vis";

export interface NotificationEntry {
  /** → ServiceRef.id */
  serviceId: string;
  addedBy: NotificationAddedBy;
  statuses: ServiceStatusEvent[];
}

export interface ArmCardPhones {
  aon: string;
  provided: string;
  onSite: string;
}

export interface ArmCardApplicant {
  name: string;
  /** Из reference.callerStatuses. */
  status: string;
  /** Формат «гггг-мм-дд». */
  birthDate?: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  /** Радиус точности на карте, м. */
  accuracy?: number;
}

export interface ArmCardAddress {
  formal: string;
  okrug: string;
  raion: string;
  descriptive: string;
  /** В фикстурах встречается null (координаты не определены) — тип принят по факту мока. */
  geo?: GeoPoint | null;
}

export interface ArmCardCasualties {
  injured: boolean;
  ambulanceRefused: boolean;
  blocked: boolean;
}

export interface ArmCardWhat {
  pollAnswers: string;
  signs: string[];
  finalType: string;
  klass: string;
  visKlass?: string;
  casualties: ArmCardCasualties;
  /** → ClassifierEntry.code */
  classifierCode?: string;
}

export interface ArmCardFixture {
  id: ArmCardId;
  /** «Происшествие 881412». */
  number: number;
  createdAt: string;
  registeredBy: string;
  source: string;
  cardStatus: CardStatus;
  phones: ArmCardPhones;
  smsList?: string[];
  applicant: ArmCardApplicant;
  address: ArmCardAddress;
  what: ArmCardWhat;
  description: string;
  workLines: WorkLine[];
  notificationList: NotificationEntry[];
  emergency: { chs: boolean; chp: boolean };
  createdByVis: boolean;
}
