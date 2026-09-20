/* Данные софтфона из мок-слоя /api/mock/* (подменяются в тестах). */
import { getCard, getReference, listScenarios, listSessions } from "@/shared/api";
import type { CardDetails, ReferenceData, Scenario, SessionContract } from "@/shared/api";

export type PhoneApi = {
  getReference: (signal?: AbortSignal) => Promise<ReferenceData>;
  listScenarios: (signal?: AbortSignal) => Promise<Scenario[]>;
  getCard: (cardId: string, signal?: AbortSignal) => Promise<CardDetails>;
  listStudentSessions: (studentId: string, signal?: AbortSignal) => Promise<SessionContract[]>;
};

export const defaultPhoneApi: PhoneApi = {
  getReference,
  listScenarios: (signal) => listScenarios(undefined, signal),
  getCard,
  listStudentSessions: (studentId, signal) => listSessions({ studentId }, signal),
};
