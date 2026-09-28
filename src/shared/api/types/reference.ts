/*
 * Справочники — spec/000-фронт/05-data-models.md §2 (mocks/reference.json, 11 коллекций).
 */

/** Статусы ДДС — жизненный цикл карточки у диспетчера (§2.1). Граф переходов — в DdsStatusDef.next. */
export type DdsStatus =
  "accepted" | "notAccepted" | "responseStarted" | "arrived" | "workInProgress" | "workDone" | "workRefused";

export interface DdsStatusDef {
  status: DdsStatus;
  title: string;
  /** true для notAccepted и workRefused. */
  requiresComment: boolean;
  /** Допустимые переходы — источник графа (не константы кода). */
  next: DdsStatus[];
}

/**
 * Статусы служб — таймлайн виджета службы (§2.2).
 * РАСХОЖДЕНИЕ (12-tasks.md, №2): спека описывает 5 значений, в reference.json фактически 9 —
 * union покрывает фактические данные (+ responseStarted/arrived/workInProgress/workRefused).
 */
export type ServiceStatus =
  | "added"
  | "received"
  | "accepted"
  | "notAccepted"
  | "responseStarted"
  | "arrived"
  | "workInProgress"
  | "workDone"
  | "workRefused";

export interface ServiceStatusDef {
  status: ServiceStatus;
  title: string;
  requiresComment: boolean;
  next: ServiceStatus[];
}

/** Статусы заявителя (§2.3), хранятся в reference.callerStatuses. */
export type CallerStatus = "очевидец" | "пострадавший" | "родственник" | "знакомый" | "ребенок" | "участник";

/** Вид службы: phoneOnly показывается светло-серым (памятка, стр. 20). */
export type ServiceKind = "arm112" | "vis" | "phoneOnly";

export interface ServiceRef {
  /** "svc-101", "svc-mosgaz" */
  id: string;
  name: string;
  shortName: string;
  kind: ServiceKind;
  /** Имя службы в ServiceNotification.service (точная строка из classifier.json). */
  classifierName?: string;
}

/** [расширение] статусы карточки целиком (§2.5). */
export type CardStatus =
  "registered" | "workedOut" | "checked" | "notNotified" | "refusal" | "unfinished" | "completed";

export interface CardStatusDef {
  status: CardStatus;
  title: string;
  /** Красная индикация. */
  alert: boolean;
}

/** [расширение] округ Москвы и его районы (сокращённый набор). */
export interface District {
  okrug: string;
  raions: string[];
}

/** [расширение] внутренний номер точки C (3–4 знака), включая учебные 101–104. */
export interface InternalNumber {
  number: string;
  title: string;
}

/**
 * Ссылка на классификатор: в reference.json записи не дублируются (§2, примечание) —
 * они отдаются отдельно (mocks/classifier.json, GET /api/mock/classifier).
 */
export interface ClassifierRowsRef {
  $ref: string;
  rowCount: number;
  note: string;
}

export interface ReferenceData {
  ddsStatuses: DdsStatusDef[];
  serviceStatuses: ServiceStatusDef[];
  callerStatuses: CallerStatus[];
  /** 9 каналов связи (§2.4). */
  channels: string[];
  services: ServiceRef[];
  /** 105 групп происшествий (значения ClassifierEntry.group). */
  incidentGroups: string[];
  classifierRows: ClassifierRowsRef;
  cardStatuses: CardStatusDef[];
  districts: District[];
  sources: string[];
  internalNumbers: InternalNumber[];
}
