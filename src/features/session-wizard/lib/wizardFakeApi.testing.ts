/*
 * Фейковый клиент мок-слоя для тестов мастера занятия (Playwright в проекте нет — интеграционные RTL).
 * Данные — статика моков волны 0 (@/shared/api), контракты те же, что у /api/mock/*.
 */
import type {
  IncidentCard,
  ProfileMappingRow,
  PublicUser,
  ReferenceData,
  Scenario,
  SessionContract,
  SessionCreateRequest,
} from "@/shared/api";
import { PROFILE_MAPPING_SEED } from "@/shared/config";

import type { SessionWizardApi } from "../model/deps";

export type WizardFakeSource = {
  users: readonly PublicUser[];
  cards: readonly IncidentCard[];
  scenarios: readonly Scenario[];
  sessions: readonly SessionContract[];
  reference: ReferenceData;
  profiles?: readonly ProfileMappingRow[];
};

export type WizardFakeApi = {
  api: SessionWizardApi;
  calls: { created: SessionCreateRequest[]; started: string[] };
};

function toProfileRows(source: WizardFakeSource): ProfileMappingRow[] {
  if (source.profiles) return [...source.profiles];
  return PROFILE_MAPPING_SEED.map((row) => ({
    id: row.id,
    profile: row.profile,
    groupName: row.groupName,
    incidentGroups: [...row.incidentGroups],
    serviceIds: [...row.serviceIds],
    studentCount: source.users.filter((user) => user.service === row.profile).length,
  }));
}

/** Клиент мастера на статике моков; фиксирует тела POST /sessions и вызовы start. */
export function createWizardFakeApi(source: WizardFakeSource): WizardFakeApi {
  const calls: WizardFakeApi["calls"] = { created: [], started: [] };
  const created: SessionContract = {
    id: "ses-001",
    teacherId: "u-002",
    studentIds: [],
    scenarioIds: [],
    mode: "practice",
    cardSource: "generated",
    cardFlow: [],
    state: "configured",
    startedAt: "2026-09-19T12:00:00+03:00",
    finishedAt: null,
    cardEvents: [],
  };
  const api: SessionWizardApi = {
    listUsers: async (query) =>
      source.users.filter((user) => !query?.role || user.role === query.role) as PublicUser[],
    getReference: async () => source.reference,
    listScenarios: async (query) =>
      source.scenarios.filter(
        (scenario) => !query?.validationStatus || scenario.validation.status === query.validationStatus,
      ) as Scenario[],
    listTrainingCards: async () => [...source.cards],
    getProfileMapping: async () => toProfileRows(source),
    listSessions: async () => source.sessions.map((session) => ({ ...session })),
    createSession: async (body) => {
      calls.created.push(body);
      return {
        ...created,
        studentIds: [...body.studentIds],
        scenarioIds: [...body.scenarioIds],
        mode: body.mode,
        cardSource: body.cardSource,
      };
    },
    startSession: async (sessionId) => {
      calls.started.push(sessionId);
      return { ...created, id: sessionId, state: "running" };
    },
  };
  return { api, calls };
}
