/*
 * Классификатор ЕКП v.046_24 — spec/000-фронт/05-data-models.md §3 (mocks/classifier.json, 1283 записи, 105 групп).
 * Поле responseScenario удалено из модели (в v.046_24 такой колонки нет) и не используется.
 */

/**
 * card112 — оповещение на АРМ-112; integration — уходит в ВИС; none — нет реагирования;
 * mapped — маппинг типа для ВИС (текст в mappedType).
 */
export type NotificationMode = "card112" | "integration" | "none" | "mapped";

export interface ServiceNotification {
  /** Имя службы из заголовка колонки xlsx → ServiceRef.classifierName. */
  service: string;
  mode: NotificationMode;
  /** Вариант подколонки ("выбран признак Пострадавшие", "газификация", …). */
  condition?: string;
  /** Текст маппинга для mode='mapped'. */
  mappedType?: string;
}

export interface ClassifierEntry {
  /** Номер (до 8 знаков), напр. "1010101". */
  code: string;
  /** Группа происшествий, напр. "пожар на улице". */
  group: string;
  sign1: string;
  sign2: string;
  sign3: string;
  /** Доп. признаки, может быть "". */
  extraSigns: string;
  finalType: string;
  ekp35Type: string;
  /** Главная служба (MCHS | Police | AMBULANCE | MOSGAZ | МСР …), может быть "". */
  mainService: string;
  notifications: ServiceNotification[];
}

/** meta из classifier.json (версия источника и объёмы). */
export interface ClassifierMeta {
  title: string;
  sourceFile: string;
  version: string;
  extractedAt: string;
  rowCount: number;
  groupCount: number;
  note: string;
}
