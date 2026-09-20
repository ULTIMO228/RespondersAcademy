import type { IssueOrder } from "../model/types";

export const APPROVED_STATUS = "approved";

/** Темп выдачи по умолчанию, сек (многозадачность Q&A в6; преподаватель меняет на шаге 7). */
export const DEFAULT_PACE_SEC = 120;

export const ISSUE_ORDER_TITLES: Record<IssueOrder, string> = {
  manual: "ручной",
  adaptive: "adaptive — адаптивная сложность",
};

export const MODE_HINTS: Record<string, string> = {
  demo: "преподаватель показывает отработку карточки",
  follow: "курсанты повторяют действия за преподавателем",
  practice: "курсанты отрабатывают карточки самостоятельно",
};

export const CARD_SOURCE_HINTS: Record<string, string> = {
  generated: "карточки из учебных сценариев и генерации системы",
  studentCreated: "карточки, заполненные курсантами на предыдущих занятиях",
  mixed: "чередование обоих пулов",
};
