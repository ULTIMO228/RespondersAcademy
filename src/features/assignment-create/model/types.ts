import type {
  AssignableMode,
  AssignmentFormat,
  AssignmentScenarioVersion,
  StudentCardEtalon,
} from "@/shared/api";

export const WIZARD_STEPS = [
  "Режим и формат",
  "Обучающиеся",
  "Билеты",
  "Параметры",
  "Проверка и создание",
] as const;

export type TicketSource = "cards" | "rule";

/** Состояние мастера: числа хранятся строками, чтобы неверный ввод оставался в поле и подсвечивался ошибкой. */
export type WizardDraft = {
  title: string;
  studentIds: string[];
  trainingMode: AssignableMode;
  format: AssignmentFormat;
  ticketSource: TicketSource;
  cardIds: string[];
  /** Только для ДДС: эталоны отобранных карточек обучающихся-112 (их id есть и в cardIds), спека 011. */
  studentCards: StudentCardEtalon[];
  /**
   * Опубликованные версии сценариев с графом (спека 015) в режимах operator112 и dds: карточка версии — билет
   * задания (её id есть и в cardIds). Смешивать с обычными билетами и карточками обучающихся нельзя (validateTickets).
   */
  scenarioVersions: AssignmentScenarioVersion[];
  ruleGroups: string[];
  ruleDifficulty: number[];
  ruleCount: string;
  answerSec: string;
  submitSec: string;
  hintsEnabled: boolean;
  /**
   * «Справочник доступен» (спека 016). null — не менялось вручную: действует значение формата
   * (тренировка — да, экзамен — нет), см. `referenceAllowedOf`.
   */
  referenceAllowed: boolean | null;
  hintIdleSec: string;
  passThreshold: string;
  timeLimitSec: string;
  /** Дата YYYY-MM-DD из поля ввода; пусто — без срока. */
  dueDate: string;
  workMessagesEnabled: boolean;
  /** Ровно четыре возрастающих значения, сек. */
  workMessageIntervals: string[];
};

/** Ошибки по полям шага; ключ — имя поля черновика. */
export type StepErrors = Partial<Record<string, string>>;

/** Совпадает с лимитом поля `StepMode` и колонкой `String(200)` с запасом; сервер не ограничивает длину. */
export const TITLE_MAX = 120;

/**
 * Начальные значения мастера (переход из карты ошибок). Идентификаторы обучающихся здесь ещё не проверены:
 * мастер отбрасывает всё, что нет в загруженном списке доступных (см. `assignableStudents`).
 */
export type WizardInitial = {
  studentIds?: string[];
  trainingMode?: AssignableMode;
  title?: string;
};

/** Значения по умолчанию совпадают с нормативами ТЗ (30 сек / 3 мин) и серверным DEFAULT_INTERVALS_SEC. */
export function createDraft(initial?: WizardInitial): WizardDraft {
  return {
    title: (initial?.title ?? "").slice(0, TITLE_MAX),
    studentIds: [...(initial?.studentIds ?? [])],
    trainingMode: initial?.trainingMode ?? "operator112",
    format: "training",
    ticketSource: "cards",
    cardIds: [],
    studentCards: [],
    scenarioVersions: [],
    ruleGroups: [],
    ruleDifficulty: [],
    ruleCount: "5",
    answerSec: "30",
    submitSec: "180",
    hintsEnabled: true,
    referenceAllowed: null,
    hintIdleSec: "20",
    passThreshold: "70",
    timeLimitSec: "",
    dueDate: "",
    workMessagesEnabled: false,
    workMessageIntervals: ["20", "50", "90", "150"],
  };
}

/** Итоговое «Справочник доступен»: ручной выбор преподавателя или значение по умолчанию формата. */
export function referenceAllowedOf(draft: Pick<WizardDraft, "format" | "referenceAllowed">): boolean {
  return draft.referenceAllowed ?? draft.format === "training";
}
