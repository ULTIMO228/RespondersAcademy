/* Зависимости мастера назначения: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import {
  createAssignment,
  getGraphScenarioVersion,
  getReference,
  listGraphScenarios,
  listStudentCards,
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
  StudentCard,
  Ticket,
} from "@/shared/api";

export type AssignmentCreateApi = {
  listStudents: () => Promise<PublicUser[]>;
  listTickets: () => Promise<Ticket[]>;
  /** Банк карточек обучающихся-112 (спека 011); без бэкенда — ServerRequiredError. */
  listStudentCards: () => Promise<StudentCard[]>;
  listIncidentGroups: () => Promise<string[]>;
  create: (body: AssignmentCreateRequest) => Promise<Assignment>;
  /** Сценарии с графом (спека 015): список опубликованных и карточка конкретной версии. */
  listGraphScenarios: (query: AIScenarioListQuery) => Promise<AIScenarioListItem[]>;
  getGraphScenarioVersion: (scenarioId: string, version: number) => Promise<AIScenarioVersion>;
};

export const assignmentCreateApi: AssignmentCreateApi = {
  listStudents: () => listUsers({ role: "student" }),
  listTickets: () => listTickets(),
  listStudentCards: () => listStudentCards(),
  listIncidentGroups: async () => (await getReference()).incidentGroups,
  create: (body) => createAssignment(body),
  listGraphScenarios: (query) => listGraphScenarios(query),
  getGraphScenarioVersion: (scenarioId, version) => getGraphScenarioVersion(scenarioId, version),
};
