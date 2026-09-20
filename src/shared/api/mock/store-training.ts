/*
 * Store: сценарии, занятия и попытки (CardEvent). Отдаёт копии; изменения — через updater по живому черновику.
 * Правила переходов (SessionState, validation.status) — в логике эндпоинтов, не здесь.
 */
import type { CardEvent, CardStatusMark, PhoneCall, Scenario, Session, SessionPlan } from "../types";
import { cloneOut, getMockState } from "./store";
import type { StoredSessionPlan } from "./store";

export function listStoredScenarios(): Scenario[] {
  return cloneOut(getMockState().scenarios);
}

export function findStoredScenario(scenarioId: string): Scenario | undefined {
  const scenario = getMockState().scenarios.find((candidate) => candidate.id === scenarioId);
  return scenario && cloneOut(scenario);
}

/** Вставка нового сценария (id назначает вызывающий через nextMockId). */
export function insertStoredScenario(scenario: Scenario): Scenario {
  getMockState().scenarios.push(cloneOut(scenario));
  return cloneOut(scenario);
}

/** Изменение сценария по месту; undefined — сценарий не найден. */
export function updateStoredScenario(
  scenarioId: string,
  updater: (draft: Scenario) => void,
): Scenario | undefined {
  const draft = getMockState().scenarios.find((candidate) => candidate.id === scenarioId);
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

/** Удаление сценария из store; false — сценарий не найден. Правила блокировки — в логике эндпоинта. */
export function removeStoredScenario(scenarioId: string): boolean {
  const state = getMockState();
  const index = state.scenarios.findIndex((candidate) => candidate.id === scenarioId);
  if (index < 0) return false;
  state.scenarios.splice(index, 1);
  return true;
}

export function listStoredSessions(): Session[] {
  return cloneOut(getMockState().sessions);
}

export function findStoredSession(sessionId: string): Session | undefined {
  const session = getMockState().sessions.find((candidate) => candidate.id === sessionId);
  return session && cloneOut(session);
}

export function insertStoredSession(session: Session): Session {
  getMockState().sessions.push(cloneOut(session));
  return cloneOut(session);
}

/** Изменение занятия по месту (state/startedAt/finishedAt/cardEvents…); undefined — не найдено. */
export function updateStoredSession(
  sessionId: string,
  updater: (draft: Session) => void,
): Session | undefined {
  const draft = getMockState().sessions.find((candidate) => candidate.id === sessionId);
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

/* ─── План мастера и состояние выдачи (T3.2-02, T3.2-11) ───────────────────────────────────────── */

/** План занятия (настройки мастера + пауза/отложенные выдачи); undefined — занятие создано без мастера. */
export function findStoredSessionPlan(sessionId: string): StoredSessionPlan | undefined {
  const stored = getMockState().sessionPlans[sessionId];
  return stored && cloneOut(stored);
}

export function insertStoredSessionPlan(sessionId: string, plan: SessionPlan): StoredSessionPlan {
  const stored: StoredSessionPlan = { plan: cloneOut(plan), pausedAt: null, parked: [] };
  getMockState().sessionPlans[sessionId] = stored;
  return cloneOut(stored);
}

/** Изменение состояния выдачи по месту; undefined — плана нет. */
export function updateStoredSessionPlan(
  sessionId: string,
  updater: (draft: StoredSessionPlan) => void,
): StoredSessionPlan | undefined {
  const draft = getMockState().sessionPlans[sessionId];
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

function findLiveAttempt(attemptId: string): CardEvent | undefined {
  for (const session of getMockState().sessions) {
    const attempt = session.cardEvents.find((event) => event.id === attemptId);
    if (attempt) return attempt;
  }
  return undefined;
}

/** Попытка (CardEvent) по id с id её занятия. */
export function findStoredAttempt(attemptId: string): { sessionId: string; attempt: CardEvent } | undefined {
  for (const session of getMockState().sessions) {
    const attempt = session.cardEvents.find((event) => event.id === attemptId);
    if (attempt) return { sessionId: session.id, attempt: cloneOut(attempt) };
  }
  return undefined;
}

/** Изменение попытки по месту; undefined — попытка не найдена. */
export function updateStoredAttempt(
  attemptId: string,
  updater: (draft: CardEvent) => void,
): CardEvent | undefined {
  const draft = findLiveAttempt(attemptId);
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

export function addAttemptStatus(attemptId: string, mark: CardStatusMark): CardEvent | undefined {
  return updateStoredAttempt(attemptId, (draft) => {
    draft.statuses.push(cloneOut(mark));
  });
}

export function setAttemptEnteredText(attemptId: string, field: string, text: string): CardEvent | undefined {
  return updateStoredAttempt(attemptId, (draft) => {
    draft.enteredText[field] = text;
  });
}

export function addAttemptCall(attemptId: string, call: PhoneCall): CardEvent | undefined {
  return updateStoredAttempt(attemptId, (draft) => {
    draft.calls.push(cloneOut(call));
  });
}
