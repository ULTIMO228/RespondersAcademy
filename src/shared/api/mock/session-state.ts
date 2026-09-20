/*
 * Машина состояний занятия (T3.2-02): draft → configured → running → finished → reported.
 * Единственный источник правил переходов для всех эндпоинтов /sessions (start, stop, control).
 * draft — черновик мастера на клиенте: POST /sessions создаёт занятие сразу в `configured`.
 * Недопустимый переход → 409 invalidTransition (spec/03-architecture.md «Сессия занятия (состояния)»).
 */
import type { Session, SessionState } from "../types";
import { HTTP_STATUS, MockApiError } from "./respond";

export const SESSION_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  draft: ["configured"],
  configured: ["running"],
  running: ["finished"],
  finished: ["reported"],
  reported: [],
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Переход занятия в `target` или 409 с ru-пояснением. */
export function assertSessionTransition(session: Session, target: SessionState): void {
  if (canTransition(session.state, target)) return;
  const message = `Переход занятия из «${session.state}» в «${target}» недопустим`;
  throw new MockApiError(HTTP_STATUS.conflict, "invalidTransition", message);
}
