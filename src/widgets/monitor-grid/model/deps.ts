"use client";

import { createContext, useContext } from "react";

import { getCard, getClassifier, getReference, getSessionControl, getSessionFeed } from "@/shared/api";
import { listScenarios, listSessions, listUsers, stopSession } from "@/shared/api";
import { systemClock } from "@/shared/lib";
import type { Clock, RealtimeDeps } from "@/shared/lib";

/*
 * Зависимости мониторинга за интерфейсами (spec/000-фронт/10-code-rules.md §6): клиент мок-слоя, часы и транспорт
 * подписки. По умолчанию — боевые реализации; тесты подменяют их через MonitorDepsContext.
 */

export type MonitorApi = {
  listSessions: typeof listSessions;
  getSessionFeed: typeof getSessionFeed;
  getSessionControl: typeof getSessionControl;
  getReference: typeof getReference;
  getCard: typeof getCard;
  getClassifier: typeof getClassifier;
  listScenarios: typeof listScenarios;
  listUsers: typeof listUsers;
  stopSession: typeof stopSession;
};

export type MonitorDeps = {
  api: MonitorApi;
  clock: Clock;
  /** Транспорт подписки: фабрика SSE-потока; не задана — long-poll (мок-слой соединений не держит). */
  realtime: Partial<RealtimeDeps>;
  /** Шаг тика ленты, мс (2000–5000). */
  tickMs?: number;
};

export const defaultMonitorApi: MonitorApi = {
  listSessions,
  getSessionFeed,
  getSessionControl,
  getReference,
  getCard,
  getClassifier,
  listScenarios,
  listUsers,
  stopSession,
};

export const defaultMonitorDeps: MonitorDeps = {
  api: defaultMonitorApi,
  clock: systemClock,
  realtime: {},
};

export const MonitorDepsContext = createContext<MonitorDeps>(defaultMonitorDeps);

export function useMonitorDeps(): MonitorDeps {
  return useContext(MonitorDepsContext);
}
