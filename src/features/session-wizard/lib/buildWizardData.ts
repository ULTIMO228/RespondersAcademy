import { PROCESSING_NORM_SEC, REACTION_NORM_SEC } from "@/entities/session";
import type { IncidentCard, ProfileMappingRow, PublicUser, Scenario, SessionContract } from "@/shared/api";

import { APPROVED_STATUS, DEFAULT_PACE_SEC } from "../config/wizard";
import type { WizardData, WizardDefaults, WizardScenario, WizardStudent } from "../model/types";
import { buildStudentPool } from "./buildStudentPool";

export type WizardSource = {
  users: readonly PublicUser[];
  incidentGroups: readonly string[];
  scenarios: readonly Scenario[];
  cards: readonly IncidentCard[];
  sessions: readonly SessionContract[];
  profiles: readonly ProfileMappingRow[];
};

const STUDENT_ROLE = "student";

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function toStudent(user: PublicUser): WizardStudent {
  return {
    id: user.id,
    fullName: user.fullName,
    armNumber: user.armNumber,
    group: user.group,
    service: user.service,
    isActive: user.isActive,
  };
}

/** Категории сценария — группы ЕКП его карточек (у Scenario своего поля группы нет). */
function toScenario(scenario: Scenario, groupByCard: Map<string, string>): WizardScenario {
  return {
    id: scenario.id,
    title: scenario.title,
    difficulty: scenario.difficulty,
    status: scenario.validation.status,
    categories: unique(scenario.cardIds.map((cardId) => groupByCard.get(cardId) ?? "")),
    reactionSec: scenario.timeNorms.primaryReactionSec,
    processingSec: scenario.timeNorms.fullProcessingSec,
    maxGrammarErrors: scenario.successCriteria.maxGrammarErrors,
    hintsEnabled: scenario.hints.enabled,
  };
}

/** Дефолты мастера: выбор пуст, нормативы — заказчика (30/180), порог ошибок — строжайший из сценариев. */
function buildDefaults(scenarios: readonly WizardScenario[]): WizardDefaults {
  const thresholds = scenarios.map((scenario) => scenario.maxGrammarErrors);
  return {
    studentIds: [],
    categories: [],
    scenarioIds: [],
    cardSource: "generated",
    mode: "practice",
    reactionSec: REACTION_NORM_SEC,
    processingSec: PROCESSING_NORM_SEC,
    maxGrammarErrors: thresholds.length > 0 ? Math.min(...thresholds) : 0,
    paceSec: DEFAULT_PACE_SEC,
  };
}

/** Данные мастера из ответов мок-слоя: группы, курсанты, категории, approved-сценарии, пул, привязка. */
export function buildWizardData(source: WizardSource): WizardData {
  const students = source.users.filter((user) => user.role === STUDENT_ROLE).map(toStudent);
  const groupByCard = new Map(source.cards.map((card) => [card.id, card.group]));
  const scenarios = source.scenarios
    .filter((scenario) => scenario.validation.status === APPROVED_STATUS)
    .map((scenario) => toScenario(scenario, groupByCard));
  return {
    groups: unique(students.map((student) => student.group ?? "")).sort((left, right) =>
      left.localeCompare(right, "ru-RU"),
    ),
    students,
    incidentGroups: [...source.incidentGroups],
    scenarios,
    pool: buildStudentPool({ sessions: source.sessions, users: source.users, cards: source.cards }),
    profiles: source.profiles.map((row) => ({
      profile: row.profile,
      incidentGroups: [...row.incidentGroups],
    })),
    defaults: buildDefaults(scenarios),
  };
}
