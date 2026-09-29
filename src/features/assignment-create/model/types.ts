import type { AssignmentFormat, AssignmentScenarioVersion, TrainingMode } from "@/shared/api";

export const WIZARD_STEPS = [
  "Обучающиеся",
  "Режим и формат",
  "Билеты",
  "Параметры",
  "Проверка и создание",
] as const;

export type TicketSource = "cards" | "rule";

/** Состояние мастера: числа хранятся строками, чтобы неверный ввод оставался в поле и подсвечивался ошибкой. */
export type WizardDraft = {
  title: string;
  studentIds: string[];
  trainingMode: TrainingMode;
  format: AssignmentFormat;
  ticketSource: TicketSource;
  cardIds: string[];
  /** Только для цепочки: утверждённые версии operator112 по выбранным билетам. */
  scenarioVersions: AssignmentScenarioVersion[];
  ruleGroups: string[];
  ruleDifficulty: number[];
  ruleCount: string;
  answerSec: string;
  submitSec: string;
  hintsEnabled: boolean;
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

/** Значения по умолчанию совпадают с нормативами ТЗ (30 сек / 3 мин) и серверным DEFAULT_INTERVALS_SEC. */
export function createDraft(): WizardDraft {
  return {
    title: "",
    studentIds: [],
    trainingMode: "operator112",
    format: "training",
    ticketSource: "cards",
    cardIds: [],
    scenarioVersions: [],
    ruleGroups: [],
    ruleDifficulty: [],
    ruleCount: "5",
    answerSec: "30",
    submitSec: "180",
    hintsEnabled: true,
    hintIdleSec: "20",
    passThreshold: "70",
    timeLimitSec: "",
    dueDate: "",
    workMessagesEnabled: false,
    workMessageIntervals: ["20", "50", "90", "150"],
  };
}
