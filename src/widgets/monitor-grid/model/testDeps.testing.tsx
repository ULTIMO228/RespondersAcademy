/*
 * Тестовые зависимости мониторинга: заглушка мок-API, управляемые часы и обёртка провайдера.
 * Только для тестов (экраны преподавателя тестируются на тех же зависимостях, что и виджет).
 * Без импорта vitest: конкретные шпионы тесты передают через overrides.
 */
import type { ReactNode } from "react";

import type { Clock, TimerHandle } from "@/shared/lib";

import { MonitorDepsContext } from "./deps";
import type { MonitorApi, MonitorDeps } from "./deps";

const DEFAULT_NOW = "2026-09-17T11:23:20+03:00";

/** Часы под контролем теста: тик выполняется вручную, реального ожидания нет. */
export function createTestClock(startMs = Date.parse(DEFAULT_NOW)) {
  const tasks = new Map<number, { run: () => void }>();
  let nowMs = startMs;
  let nextId = 1;
  const clock: Clock = {
    now: () => nowMs,
    setTimeout: (callback) => {
      const id = nextId++;
      tasks.set(id, { run: callback });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      tasks.delete(handle as unknown as number);
    },
  };
  /** Выполнить все отложенные задачи (тик ленты и таймеров). */
  const runAll = () => {
    [...tasks.entries()].forEach(([id, task]) => {
      tasks.delete(id);
      task.run();
    });
  };
  const advance = (deltaMs: number) => {
    nowMs += deltaMs;
  };
  return { clock, runAll, advance, pending: () => tasks.size };
}

const EMPTY_REFERENCE = { ddsStatuses: [], internalNumbers: [], services: [], serviceStatuses: [] };

/** Частичные заглушки: фикстуры тестов не обязаны быть полными контрактными объектами. */
export type TestApiOverrides = Partial<Record<keyof MonitorApi, unknown>>;

export function createTestApi(overrides: TestApiOverrides = {}): MonitorApi {
  const stub = {
    listSessions: async () => [],
    getSessionFeed: async (sessionId: string) => ({ sessionId, at: "at-0", events: [] }),
    getSessionControl: async () => {
      throw new Error("нет управления занятием");
    },
    getReference: async () => EMPTY_REFERENCE,
    getCard: async () => {
      throw new Error("карточка не задана");
    },
    getClassifier: async () => [],
    listScenarios: async () => [],
    listUsers: async () => [],
    stopSession: async () => {
      throw new Error("завершение не задано");
    },
  };
  return { ...stub, ...overrides } as unknown as MonitorApi;
}

export function withDeps(deps: Partial<MonitorDeps>, children: ReactNode) {
  const value: MonitorDeps = {
    api: deps.api ?? createTestApi(),
    clock: deps.clock ?? createTestClock().clock,
    realtime: deps.realtime ?? {},
    tickMs: deps.tickMs,
  };
  return <MonitorDepsContext.Provider value={value}>{children}</MonitorDepsContext.Provider>;
}
