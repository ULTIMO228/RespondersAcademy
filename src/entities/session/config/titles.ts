import type { CardSource, SessionMode, SessionState, Severity, StudentLiveState } from "../model/types";

export const SESSION_STATE_TITLES: Record<SessionState, string> = {
  draft: "Черновик",
  configured: "Настроено",
  running: "Идёт занятие",
  finished: "Занятие завершено",
  reported: "Отчёт сформирован",
};

/** Режимы занятия (Q&A в9). */
export const MODE_TITLES: Record<SessionMode, string> = {
  demo: "показ",
  follow: "делай как я",
  practice: "самостоятельная",
};

/** Категория вопросов Session.cardSource — дословно по ТЗ §10 / spec/04-pages/12. */
export const CARD_SOURCE_TITLES: Record<CardSource, string> = {
  generated: "сгенерированные системой",
  studentCreated: "сформированные обучающимися",
  mixed: "смешанный выбор",
};

export const STUDENT_STATE_TITLES: Record<StudentLiveState, string> = {
  waiting: "ожидает",
  working: "отрабатывает",
  finished: "завершил карточку",
  offline: "не подключён",
};

export const SEVERITY_TITLES: Record<Severity, string> = {
  critical: "критичная",
  major: "существенная",
  minor: "незначительная",
};

/** Подписи полей ручного ввода курсанта (CardEvent.enteredText). */
export const ENTERED_FIELD_TITLES: Record<string, string> = {
  dispatcherAction: "Действие диспетчера",
  outfitNumber: "Номер наряда",
};
