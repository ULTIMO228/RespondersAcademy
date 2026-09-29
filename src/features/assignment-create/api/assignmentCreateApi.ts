/* Зависимости мастера назначения: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import {
  createAssignment,
  getReference,
  listAIScenarioVersions,
  listScenarios,
  listTickets,
  listUsers,
} from "@/shared/api";
import type {
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
};

export const assignmentCreateApi: AssignmentCreateApi = {
  listStudents: () => listUsers({ role: "student" }),
  listTickets: () => listTickets(),
  listIncidentGroups: async () => (await getReference()).incidentGroups,
  listScenarios: () => listScenarios(),
  listScenarioVersions: (scenarioId) => listAIScenarioVersions(scenarioId),
  create: (body) => createAssignment(body),
};
