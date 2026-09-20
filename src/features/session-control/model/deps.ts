"use client";

import { createContext, useContext } from "react";

import { getSessionControl, postSessionControl, stopSession } from "@/shared/api";

/*
 * Зависимости управления занятием за интерфейсом (spec/10-code-rules.md §6): клиент мок-слоя /api/mock.
 * Тесты подменяют через проп `api` компонента SessionControl.
 */
export type SessionControlApi = {
  getSessionControl: typeof getSessionControl;
  postSessionControl: typeof postSessionControl;
  stopSession: typeof stopSession;
};

export const defaultSessionControlApi: SessionControlApi = {
  getSessionControl,
  postSessionControl,
  stopSession,
};

export const SessionControlApiContext = createContext<SessionControlApi>(defaultSessionControlApi);

export function useSessionControlApi(): SessionControlApi {
  return useContext(SessionControlApiContext);
}
