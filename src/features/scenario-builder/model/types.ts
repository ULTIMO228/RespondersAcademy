import type { Difficulty } from "@/shared/api";
import type { StatusTone } from "@/shared/ui";

export type ValidationStatus = "draft" | "pending" | "approved" | "rejected";
export type ScenarioSource = "template" | "generated";

/**
 * Проекция учебной карточки для конструктора: группа ЕКП и итоговые типы по матрице классификатора
 * (classifier.json — 3,5 МБ, поэтому сопоставление делает серверный компонент страницы, а в клиент
 * уезжает только эта короткая выжимка).
 */
export type TrainingCardView = {
  id: string;
  /** 1..32 — билет-источник (нужен новому сценарию: Scenario.sourceTicketNo). */
  ticketNo: number;
  group: string;
  summary: string;
  finalTypes: string[];
  expectedServices: string[];
  expectedTags: string[];
  /** Id UI-фикстуры ПОВ-112 для предпросмотра карточки-основы; пусто — фикстуры нет. */
  fixtureId?: string;
};

/** Строка списка сценариев (готовится на сервере из scenarios.json + cards.json + classifier.json). */
export type ScenarioRow = {
  id: string;
  title: string;
  categories: string[];
  finalTypes: string[];
  difficulty: number;
  source: string;
  status: string;
  comment?: string;
  keyPhrases: string[];
  cardCount: number;
};

export type ScenarioFilterState = {
  categories: string[];
  difficulty: string;
  source: string;
  status: string;
};

export type ValidationStatusView = {
  title: string;
  tone: StatusTone;
};

/** Узел дерева ЕКП в редакторе: запись классификатора и отметка «выбрана для сценария». */
export type ClassifierTreeNode = {
  code: string;
  path: string;
  finalType: string;
  isSelected: boolean;
};

export type ClassifierTreeGroup = {
  group: string;
  totalCount: number;
  nodes: ClassifierTreeNode[];
};

export type TextSegment = {
  text: string;
  isMatch: boolean;
};

/** Строка таблицы профильных категорий для UI (служба/группа → группы ЕКП → службы-получатели). */
export type ProfileRowView = {
  id: string;
  profile: string;
  groupName?: string;
  studentCount: number;
  incidentGroups: string[];
  serviceNames: string[];
};

export type LabeledValue = {
  id: string;
  label: string;
  value: string;
};

export type ScenarioParamsView = {
  title: string;
  categories: string[];
  classifierTree: ClassifierTreeGroup[];
  districts: { okrug: string; raions: string[] }[];
  okrug: string;
  raion: string;
  difficulty: Difficulty;
  reactionSec: number;
  processingSec: number;
  mode: string;
};

export type PreviewQuestion = {
  id: string;
  question: string;
  answer: string;
  phrases: string[];
};

export type SuccessCriteriaView = {
  maxGrammarErrors: number;
  requiredFields: string[];
  syntaxRequirements: string;
};
