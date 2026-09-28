/*
 * Управление занятием во время проведения (T3.2-11, T3.2-12; spec/000-фронт/04-pages/12 «Управление во время занятия»):
 *   GET  /api/mock/sessions/[id]/control — занятие, настройки мастера, состояние выдачи;
 *   POST /api/mock/sessions/[id]/control — pause | resume | issue | report.
 *
 * Пауза не меняет контракт Session: невыданные CardFlowItem переезжают в отложенные (store), при снятии
 * паузы возвращаются со сдвигом на длительность паузы. «Завершить занятие» (stop) паузой не блокируется.
 * report — переход finished → reported (отчёт сформирован, T3.2-12), правила — session-state.ts;
 * сам отчёт по данным занятия собирает reports-runtime.ts — сборщик передаёт серверная сборка
 * (app/api/mock/_server), потому что оценка попытки живёт в entities/report.
 */
import type { CardFlowItem, Session, SessionControlRequest, SessionControlResponse } from "../types";
import { DEFAULT_SESSION_PLAN, nextCardForStudent } from "./session-plan";
import { assertSessionTransition } from "./session-state";
import { isRecord, readJsonBody } from "./request";
import { notFound, validationFailed } from "./respond";
import { findCard } from "./cards";
import {
  findStoredSession,
  findStoredSessionPlan,
  insertStoredSessionPlan,
  updateStoredSession,
  updateStoredSessionPlan,
} from "./store-training";
import { nowIso, parseIso, toMoscowIso } from "./time";

const CONTROL_ACTIONS = ["pause", "resume", "issue", "report"] as const;
type ControlAction = (typeof CONTROL_ACTIONS)[number];

function requireSession(sessionId: string): Session {
  const session = findStoredSession(sessionId);
  if (!session) throw notFound(`Занятие «${sessionId}» не найдено`);
  return session;
}

/** Состояние выдачи занятия без записи в store (у занятий без мастера — план по умолчанию). */
function readPlanState(sessionId: string) {
  return (
    findStoredSessionPlan(sessionId) ?? { plan: DEFAULT_SESSION_PLAN, pausedAt: null, parked: [] as const }
  );
}

/** Состояние выдачи для изменения: занятию без мастера план заводится по умолчанию. */
function ensurePlanState(sessionId: string) {
  return findStoredSessionPlan(sessionId) ?? insertStoredSessionPlan(sessionId, DEFAULT_SESSION_PLAN);
}

function toResponse(sessionId: string): SessionControlResponse {
  const session = requireSession(sessionId);
  const stored = readPlanState(sessionId);
  const nowMs = parseIso(nowIso());
  const pending = session.cardFlow.filter((item) => parseIso(item.issuedAt) > nowMs).length;
  return {
    session,
    plan: findStoredSessionPlan(sessionId)?.plan ?? null,
    paused: stored.pausedAt !== null,
    pausedAt: stored.pausedAt,
    pendingCount: pending + stored.parked.length,
  };
}

/** GET — текущее состояние управления занятием. */
export function getSessionControl(sessionId: string): SessionControlResponse {
  return toResponse(sessionId);
}

/* ─── Пауза выдачи ──────────────────────────────────────────────────────────────────────────────── */

function pauseFlow(sessionId: string): void {
  const session = requireSession(sessionId);
  const stored = ensurePlanState(sessionId);
  if (stored.pausedAt !== null) return;
  const at = nowIso();
  const atMs = parseIso(at);
  const parked = session.cardFlow.filter((item) => parseIso(item.issuedAt) > atMs);
  updateStoredSession(sessionId, (draft) => {
    draft.cardFlow = draft.cardFlow.filter((item) => parseIso(item.issuedAt) <= atMs);
  });
  updateStoredSessionPlan(sessionId, (draft) => {
    draft.pausedAt = at;
    draft.parked = parked;
  });
}

function shift(items: readonly CardFlowItem[], offsetMs: number): CardFlowItem[] {
  return items.map((item) => ({
    ...item,
    issuedAt: toMoscowIso(new Date(parseIso(item.issuedAt) + offsetMs)),
  }));
}

function resumeFlow(sessionId: string): void {
  const stored = ensurePlanState(sessionId);
  if (stored.pausedAt === null) return;
  const offsetMs = parseIso(nowIso()) - parseIso(stored.pausedAt);
  const resumed = shift(stored.parked, offsetMs);
  updateStoredSession(sessionId, (draft) => {
    draft.cardFlow = [...draft.cardFlow, ...resumed];
  });
  updateStoredSessionPlan(sessionId, (draft) => {
    draft.pausedAt = null;
    draft.parked = [];
  });
}

/* ─── Внеочередная выдача ───────────────────────────────────────────────────────────────────────── */

/** Принудительная выдача карточки курсанту «сейчас» — ручной разгон темпа (ТЗ §10). */
function issueCard(sessionId: string, studentId: string | undefined, cardId: string | undefined): void {
  const session = requireSession(sessionId);
  if (session.state !== "running") throw validationFailed("Карточку можно выдать только во время занятия");
  if (!studentId || !session.studentIds.includes(studentId)) {
    throw validationFailed("Выберите курсанта занятия");
  }
  const plan = ensurePlanState(sessionId).plan;
  const planned = cardId
    ? { cardId, level: session.cardFlow.find((item) => item.cardId === cardId)?.level ?? 1 }
    : nextCardForStudent(session, plan, studentId);
  if (!planned) throw validationFailed("Для курсанта не осталось карточек выбранных категорий");
  if (!findCard(planned.cardId)) throw validationFailed(`Карточка «${planned.cardId}» не найдена`);
  updateStoredSession(sessionId, (draft) => {
    draft.cardFlow.push({ cardId: planned.cardId, studentId, issuedAt: nowIso(), level: planned.level });
  });
}

/* ─── Отчёт ─────────────────────────────────────────────────────────────────────────────────────── */

/** finished → reported: отчёт по занятию сформирован (T3.2-12). */
function markReported(sessionId: string): void {
  const session = requireSession(sessionId);
  assertSessionTransition(session, "reported");
  updateStoredSession(sessionId, (draft) => {
    draft.state = "reported";
  });
}

function readAction(body: Record<string, unknown>): ControlAction {
  const action = body.action;
  if (typeof action !== "string" || !(CONTROL_ACTIONS as readonly string[]).includes(action)) {
    throw validationFailed(`Некорректное действие управления занятием: ${String(action)}`);
  }
  return action as ControlAction;
}

function readOptionalId(body: Record<string, unknown>, key: keyof SessionControlRequest): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw validationFailed(`Некорректное поле «${key}»`);
  return value.trim();
}

/** Сборка отчёта занятия по его данным (reports-runtime.ts); без неё переход в reported просто меняет статус. */
export type SessionReportBuilder = (sessionId: string) => Promise<void>;

/** POST — pause | resume | issue | report; ответ одинаковый для всех действий. */
export async function postSessionControl(
  sessionId: string,
  httpRequest: Request,
  buildReport: SessionReportBuilder | null = null,
): Promise<SessionControlResponse> {
  const body = await readJsonBody(httpRequest);
  if (!isRecord(body)) throw validationFailed("Некорректное тело запроса");
  const action = readAction(body);
  requireSession(sessionId);
  if (action === "pause") pauseFlow(sessionId);
  if (action === "resume") resumeFlow(sessionId);
  if (action === "issue")
    issueCard(sessionId, readOptionalId(body, "studentId"), readOptionalId(body, "cardId"));
  if (action === "report") {
    markReported(sessionId);
    // «Сформирован за N сек» (ТЗ §7) считается честно: generatedAt отчёта − finishedAt занятия.
    if (buildReport) await buildReport(sessionId);
  }
  return toResponse(sessionId);
}
