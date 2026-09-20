import type { CardSource, SessionMode } from "@/entities/session";
import type { SessionIssueOrder } from "@/shared/api";

export type WizardStudent = {
  id: string;
  fullName: string;
  armNumber: number;
  group?: string;
  service?: string;
  /** Признак подключения курсанта к классу (в моке — User.isActive): false → плитка «не подключён». */
  isActive: boolean;
};

export type WizardScenario = {
  id: string;
  title: string;
  difficulty: number;
  status: string;
  /** Группы ЕКП карточек сценария (GET /training-cards). */
  categories: string[];
  /** Нормативы сценария, сек (Scenario.timeNorms) — наследуются в тайминги занятия. */
  reactionSec: number;
  processingSec: number;
  /** Порог грамматических ошибок сценария (SuccessCriteria.maxGrammarErrors). */
  maxGrammarErrors: number;
  /** Подсказки сценария (Scenario.hints.enabled): выключены — тумблер занятия помечается пояснением. */
  hintsEnabled: boolean;
};

/** Карточка пула studentCreated: заполнена курсантом на прошлом занятии (createdByStudentId). */
export type PoolCard = {
  id: string;
  cardNumber: string;
  cardType: string;
  authorName: string;
  sessionDate: string;
};

export type IssueOrder = SessionIssueOrder;

/** Стартовые значения мастера: нормативы и пороги наследуются из выбранных сценариев. */
export type WizardDefaults = {
  studentIds: string[];
  categories: string[];
  scenarioIds: string[];
  cardSource: CardSource;
  mode: SessionMode;
  reactionSec: number;
  processingSec: number;
  maxGrammarErrors: number;
  paceSec: number;
};

export type ProfileWarning = {
  studentId: string;
  text: string;
};

/** Строка привязки «профиль курсанта → профильные группы ЕКП» (GET /profile-mapping, T3.1-09). */
export type ProfileRow = {
  profile: string;
  incidentGroups: string[];
};

/** Данные мастера, загруженные из мок-слоя. */
export type WizardData = {
  /** Учебные группы курсантов (User.group). */
  groups: string[];
  students: WizardStudent[];
  incidentGroups: string[];
  scenarios: WizardScenario[];
  pool: PoolCard[];
  profiles: ProfileRow[];
  defaults: WizardDefaults;
};

export type WizardLoadStatus = "loading" | "ready" | "error";
