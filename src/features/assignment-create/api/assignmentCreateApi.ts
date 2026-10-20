/* Зависимости мастера назначения: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import {
  createAssignment,
  getGraphScenarioVersion,
  getReference,
  listAIScenarioVersions,
  listGraphScenarios,
  listScenarios,
  listTickets,
  listUsers,
} from "@/shared/api";
import type {
  AIScenarioListItem,
  AIScenarioListQuery,
  AIScenarioVersion,
  Assignment,
  AssignmentCreateRequest,
  PublicUser,
  Scenario,
  Ticket,
} from "@/shared/api";

export type AssignmentCreateApi = {
  listStudents: () => Promise<PublicUser[]>;
  listTickets: () => Promise<Ticket[]>;
  listIncidentGroups: () => Promise<string[]>;
  listScenarios: () => Promise<Scenario[]>;
  listScenarioVersions: (scenarioId: string) => Promise<AIScenarioVersion[]>;
  create: (body: AssignmentCreateRequest) => Promise<Assignment>;
  /** Сценарии с графом (спека 005): список опубликованных и карточка конкретной версии. */
  listGraphScenarios: (query: AIScenarioListQuery) => Promise<AIScenarioListItem[]>;
  getGraphScenarioVersion: (scenarioId: string, version: number) => Promise<AIScenarioVersion>;
};

export const assignmentCreateApi: AssignmentCreateApi = {
  listStudents: () => listUsers({ role: "student" }),
  listTickets: () => listTickets(),
  listIncidentGroups: async () => (await getReference()).incidentGroups,
  listScenarios: () => listScenarios(),
  listScenarioVersions: (scenarioId) => listAIScenarioVersions(scenarioId),
  create: (body) => createAssignment(body),
  listGraphScenarios: (query) => listGraphScenarios(query),
  getGraphScenarioVersion: (scenarioId, version) => getGraphScenarioVersion(scenarioId, version),
};
