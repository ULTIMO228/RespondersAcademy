/* Зависимости мастера назначения: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { createAssignment, getReference, listTickets, listUsers } from "@/shared/api";
import type { Assignment, AssignmentCreateRequest, PublicUser, Ticket } from "@/shared/api";

export type AssignmentCreateApi = {
  listStudents: () => Promise<PublicUser[]>;
  listTickets: () => Promise<Ticket[]>;
  listIncidentGroups: () => Promise<string[]>;
  create: (body: AssignmentCreateRequest) => Promise<Assignment>;
};

export const assignmentCreateApi: AssignmentCreateApi = {
  listStudents: () => listUsers({ role: "student" }),
  listTickets: () => listTickets(),
  listIncidentGroups: async () => (await getReference()).incidentGroups,
  create: (body) => createAssignment(body),
};
