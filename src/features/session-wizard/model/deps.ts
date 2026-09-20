"use client";

import { createContext, useContext } from "react";

import {
  createSession,
  getProfileMapping,
  getReference,
  listScenarios,
  listSessions,
  listTrainingCards,
  listUsers,
  startSession,
} from "@/shared/api";

/*
 * Зависимости мастера занятия за интерфейсом (spec/10-code-rules.md §6): клиент мок-слоя /api/mock.
 * По умолчанию — боевые функции; тесты подменяют через проп `deps` компонента SessionWizard.
 * Компоненты мастера не знают про fetch и URL.
 */
export type SessionWizardApi = {
  listUsers: typeof listUsers;
  getReference: typeof getReference;
  listScenarios: typeof listScenarios;
  listTrainingCards: typeof listTrainingCards;
  getProfileMapping: typeof getProfileMapping;
  listSessions: typeof listSessions;
  createSession: typeof createSession;
  startSession: typeof startSession;
};

export const defaultSessionWizardApi: SessionWizardApi = {
  listUsers,
  getReference,
  listScenarios,
  listTrainingCards,
  getProfileMapping,
  listSessions,
  createSession,
  startSession,
};

export const SessionWizardApiContext = createContext<SessionWizardApi>(defaultSessionWizardApi);

export function useSessionWizardApi(): SessionWizardApi {
  return useContext(SessionWizardApiContext);
}
