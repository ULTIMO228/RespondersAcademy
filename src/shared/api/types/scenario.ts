/*
 * Учебные сценарии и эталоны — spec/05-data-models.md §6 (mocks/scenarios.json, 36 шт.).
 */
import type { ScenarioMode } from "./session";

/** Норматив п. 1.4: шаблон / генеративная вариация. */
export type ScenarioLevel = "beginner" | "advanced";

/**
 * [расширение] гранулярная сложность.
 * Маппинг: beginner ↔ difficulty 1–2, advanced ↔ difficulty 3–5.
 */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type ScenarioValidationStatus = "draft" | "pending" | "approved" | "rejected";

/** template — шаблон; generated — сгенерирован ИИ (контракт бейджа «ИИ» в UI). */
export type ScenarioSource = "template" | "generated";

export interface Etalon {
  expectedFields?: Record<string, string>;
  /** Ожидаемая последовательность действий (статусы ДДС, звонок точке C). */
  expectedActions: string[];
  expectedText?: string;
  keyPhrases: string[];
}

export interface ScenarioValidation {
  status: ScenarioValidationStatus;
  /** userId преподавателя. */
  reviewedBy?: string;
  comment?: string;
  /** Поля, утверждённые частично (approvePartial) — заполняется мок-слоем. */
  approvedFields?: string[];
}

export interface ScenarioTimeNorms {
  /** Норматив первичной реакции, сек (30). */
  primaryReactionSec: number;
  /** Норматив полной обработки, сек (180). */
  fullProcessingSec: number;
}

export interface ScenarioHints {
  enabled: boolean;
  texts: string[];
}

export interface SuccessCriteria {
  maxGrammarErrors: number;
  requiredFields: string[];
  syntaxRequirements: string;
}

export interface Scenario {
  /** "s-001" */
  id: string;
  title: string;
  level: ScenarioLevel;
  sourceTicketNo: number;
  /** Очередь карточек → IncidentCard.id. */
  cardIds: string[];
  timeNorms: ScenarioTimeNorms;
  hints: ScenarioHints;
  /** Внутренний номер главной службы для голосового контура B→C. */
  callTarget?: string;
  difficulty: Difficulty;
  etalon: Etalon;
  validation: ScenarioValidation;
  successCriteria: SuccessCriteria;
  source: ScenarioSource;
  /**
   * [расширение] Режим отработки по умолчанию (spec/04-pages/11, редактор п. 1: demo/follow/practice).
   * В spec/05 §6 поля нет — в mocks/scenarios.json оно отсутствует; мастер занятия задаёт Session.mode.
   */
  mode?: ScenarioMode;
}
