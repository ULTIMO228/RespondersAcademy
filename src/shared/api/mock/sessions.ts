/*
 * Занятия (T1.1-15, T1.1-16): GET/POST /api/mock/sessions, POST /[id]/start, POST /[id]/stop, GET /[id]/feed.
 *
 * Состояния строго по SessionState: draft → configured → running → finished → reported.
 * POST /sessions создаёт занятие по мастеру — сразу `configured` (мастер заполнен целиком; draft — черновик
 * мастера на клиенте). start: configured → running (+ startedAt); stop: running → finished (+ finishedAt) —
 * «Завершить занятие» доступно в любой момент идущего занятия. Иные переходы → 409 invalidTransition.
 * Ссылочная целостность проверяется на входе (users/scenarios/cards) → 400. Метки времени — ISO +03:00.
 */
import type {
  CardFlowItem,
  Session,
  SessionCreateRequest,
  SessionFeedEvent,
  SessionFeedResponse,
  SessionPlan,
  SessionState,
} from "../types";
import { readCards } from "./readers";
import { isRecord, readJsonBody, readStringParam } from "./request";
import { forbidden, notFound, validationFailed } from "./respond";
import { buildPlannedCardFlow } from "./session-plan";
import { assertSessionTransition } from "./session-state";
import { MOCK_ID_PREFIX, nextMockId } from "./store";
import {
  findStoredScenario,
  findStoredSession,
  findStoredSessionPlan,
  insertStoredSession,
  insertStoredSessionPlan,
  listStoredSessions,
} from "./store-training";
import { updateStoredSession } from "./store-training";
import { findStoredUser } from "./store-admin";
import { nowIso, parseIso, toMoscowIso } from "./time";
import { isStudentViewer, resolveStudentScope } from "./viewer";
import type { MockViewer } from "./viewer";

const SESSION_STATES: readonly SessionState[] = ["draft", "configured", "running", "finished", "reported"];
const MODES: readonly Session["mode"][] = ["demo", "follow", "practice"];
const CARD_SOURCES: readonly Session["cardSource"][] = ["generated", "studentCreated", "mixed"];
const ISSUE_ORDERS: readonly SessionPlan["issueOrder"][] = ["manual", "adaptive"];

/**
 * Шаг расписания выдачи по умолчанию (если мастер не передал cardFlow): норматив полной обработки 3 мин.
 * Расписание строится при start от startedAt: каждому курсанту — карточки сценариев по порядку.
 */
const DEFAULT_ISSUE_INTERVAL_MS = 180_000;

function isOneOf<TValue extends string>(values: readonly TValue[], candidate: unknown): candidate is TValue {
  return typeof candidate === "string" && (values as readonly string[]).includes(candidate);
}

function isStringArray(candidate: unknown): candidate is string[] {
  return Array.isArray(candidate) && candidate.every((item) => typeof item === "string");
}

/* ─── Список ────────────────────────────────────────────────────────────────────────────────────── */

/** Per-student проекция занятия (entities/session projectSessionForStudent — передаёт серверная сборка). */
export type SessionProjector = (
  session: Session,
  studentId: string,
) => Pick<Session, "cardFlow" | "cardEvents">;

/** Кто запрашивает список: обучающемуся — только занятия с ним и только его выдачи/попытки (ТЗ §8). */
export type SessionListAccess = { viewer: MockViewer | null; project: SessionProjector };

function projectForViewer(session: Session, access: SessionListAccess | undefined): Session {
  if (!access || !isStudentViewer(access.viewer)) return session;
  const studentId = access.viewer.userId;
  return { ...session, studentIds: [studentId], ...access.project(session, studentId) };
}

export function listSessions(params: URLSearchParams, access?: SessionListAccess): Session[] {
  const teacherId = readStringParam(params, "teacherId");
  const studentId = resolveStudentScope(access?.viewer ?? null, readStringParam(params, "studentId"));
  const state = readStringParam(params, "state");
  if (state !== undefined && !isOneOf(SESSION_STATES, state)) {
    throw validationFailed(`Некорректное состояние занятия: ${state}`);
  }
  return listStoredSessions()
    .filter(
      (session) =>
        (!teacherId || session.teacherId === teacherId) &&
        (!studentId || session.studentIds.includes(studentId)) &&
        (!state || session.state === state),
    )
    .map((session) => projectForViewer(session, access));
}

/* ─── Создание по мастеру ───────────────────────────────────────────────────────────────────────── */

function assertParticipants(body: Record<string, unknown>): void {
  if (typeof body.teacherId !== "string" || findStoredUser(body.teacherId)?.role !== "teacher") {
    throw validationFailed("Преподаватель занятия не найден");
  }
  if (!isStringArray(body.studentIds) || body.studentIds.length === 0) {
    throw validationFailed("Выберите курсантов занятия");
  }
  const stranger = body.studentIds.find((id) => findStoredUser(id)?.role !== "student");
  if (stranger) throw validationFailed(`Курсант «${stranger}» не найден`);
}

function assertScenarios(scenarioIds: unknown): void {
  if (!isStringArray(scenarioIds) || scenarioIds.length === 0) {
    throw validationFailed("Выберите сценарии занятия");
  }
  for (const scenarioId of scenarioIds) {
    const scenario = findStoredScenario(scenarioId);
    if (!scenario) throw validationFailed(`Сценарий «${scenarioId}» не найден`);
    if (scenario.validation.status !== "approved") {
      throw validationFailed(`Сценарий «${scenarioId}» не утверждён и недоступен для занятий`);
    }
  }
}

function isFlowItem(
  candidate: unknown,
  studentIds: readonly string[],
  cardIds: ReadonlySet<string>,
): boolean {
  return (
    isRecord(candidate) &&
    typeof candidate.cardId === "string" &&
    cardIds.has(candidate.cardId) &&
    typeof candidate.studentId === "string" &&
    studentIds.includes(candidate.studentId) &&
    typeof candidate.issuedAt === "string" &&
    !Number.isNaN(parseIso(candidate.issuedAt)) &&
    typeof candidate.level === "number"
  );
}

function readCardFlow(cardFlow: unknown, studentIds: readonly string[]): CardFlowItem[] {
  if (cardFlow === undefined) return [];
  const cardIds = new Set(readCards().map((card) => card.id));
  if (!Array.isArray(cardFlow) || !cardFlow.every((item) => isFlowItem(item, studentIds, cardIds))) {
    throw validationFailed("Некорректное расписание выдачи карточек (cardFlow)");
  }
  return cardFlow as CardFlowItem[];
}

function isTimeNorms(candidate: unknown): candidate is SessionPlan["timeNorms"] {
  return (
    isRecord(candidate) &&
    typeof candidate.primaryReactionSec === "number" &&
    candidate.primaryReactionSec > 0 &&
    typeof candidate.fullProcessingSec === "number" &&
    candidate.fullProcessingSec > 0
  );
}

/**
 * План мастера (T3.2-02): настройки шагов 2 и 4–7, по которым start строит расписание. Нормативы — два
 * раздельных положительных значения (Q&A в6), темп — секунды > 0. Мусор → 400.
 */
function readSessionPlan(plan: unknown): SessionPlan | undefined {
  if (plan === undefined) return undefined;
  if (
    !isRecord(plan) ||
    !isStringArray(plan.categories) ||
    !isOneOf(ISSUE_ORDERS, plan.issueOrder) ||
    typeof plan.hints !== "boolean" ||
    !isTimeNorms(plan.timeNorms) ||
    typeof plan.maxGrammarErrors !== "number" ||
    plan.maxGrammarErrors < 0 ||
    typeof plan.paceSec !== "number" ||
    plan.paceSec <= 0 ||
    typeof plan.conveyor !== "boolean"
  ) {
    throw validationFailed("Некорректные настройки занятия (plan)");
  }
  return plan as unknown as SessionPlan;
}

function parseCreateRequest(body: Record<string, unknown>): SessionCreateRequest {
  assertParticipants(body);
  assertScenarios(body.scenarioIds);
  if (!isOneOf(MODES, body.mode)) throw validationFailed("Выберите режим занятия");
  if (!isOneOf(CARD_SOURCES, body.cardSource)) throw validationFailed("Выберите категорию вопросов");
  const request = body as unknown as SessionCreateRequest;
  return {
    ...request,
    cardFlow: readCardFlow(body.cardFlow, request.studentIds),
    plan: readSessionPlan(body.plan),
  };
}

/**
 * POST /sessions → 201, state `configured`, id "ses-NNN".
 * startedAt до старта — время создания (поле обязательно в контракте Session), перезаписывается при start.
 * timeNorms запроса в Session не сохраняются (в контракте Session поля нет; нормативы — в плане мастера,
 * который мок-слой хранит рядом с занятием: SessionPlan, T3.2-02).
 */
export async function createSession(httpRequest: Request): Promise<Session> {
  const request = parseCreateRequest(await readJsonBody(httpRequest));
  const session = insertStoredSession({
    id: nextMockId(MOCK_ID_PREFIX.session),
    teacherId: request.teacherId,
    studentIds: [...request.studentIds],
    scenarioIds: [...request.scenarioIds],
    mode: request.mode,
    cardSource: request.cardSource,
    cardFlow: request.cardFlow ?? [],
    state: "configured",
    startedAt: nowIso(),
    finishedAt: null,
    cardEvents: [],
  });
  if (request.plan) insertStoredSessionPlan(session.id, request.plan);
  return session;
}

/* ─── start / stop ──────────────────────────────────────────────────────────────────────────────── */

function requireSession(sessionId: string): Session {
  const session = findStoredSession(sessionId);
  if (!session) throw notFound(`Занятие «${sessionId}» не найдено`);
  return session;
}

/** Правила переходов — единая машина состояний занятия (session-state.ts, T3.2-02). */
function assertState(session: Session, target: SessionState): void {
  assertSessionTransition(session, target);
}

/** Расписание по умолчанию: каждому курсанту — карточки сценариев по порядку с шагом DEFAULT_ISSUE_INTERVAL_MS. */
function buildDefaultCardFlow(session: Session, startedAt: string): CardFlowItem[] {
  const startMs = parseIso(startedAt);
  const queue = session.scenarioIds.flatMap((scenarioId) => {
    const scenario = findStoredScenario(scenarioId);
    return scenario ? scenario.cardIds.map((cardId) => ({ cardId, level: scenario.difficulty })) : [];
  });
  return session.studentIds.flatMap((studentId) =>
    queue.map(({ cardId, level }, index) => ({
      cardId,
      studentId,
      issuedAt: toMoscowIso(new Date(startMs + index * DEFAULT_ISSUE_INTERVAL_MS)),
      level,
    })),
  );
}

/**
 * Расписание занятия при старте: явный cardFlow запроса (занятие курсанта по назначенному модулю) →
 * план мастера (темп, порядок, конвейер, категории, профили — session-plan.ts) → расписание по умолчанию.
 */
function resolveStartCardFlow(session: Session, startedAt: string): CardFlowItem[] {
  if (session.cardFlow.length > 0) return session.cardFlow;
  const stored = findStoredSessionPlan(session.id);
  return stored
    ? buildPlannedCardFlow(session, stored.plan, startedAt)
    : buildDefaultCardFlow(session, startedAt);
}

export function startSession(sessionId: string): Session {
  const session = requireSession(sessionId);
  assertState(session, "running");
  const startedAt = nowIso();
  const cardFlow = resolveStartCardFlow(session, startedAt);
  return (
    updateStoredSession(sessionId, (draft) => {
      draft.state = "running";
      draft.startedAt = startedAt;
      draft.cardFlow = cardFlow;
    }) ?? session
  );
}

export function stopSession(sessionId: string): Session {
  const session = requireSession(sessionId);
  assertState(session, "finished");
  return (
    updateStoredSession(sessionId, (draft) => {
      draft.state = "finished";
      draft.finishedAt = nowIso();
    }) ?? session
  );
}

/* ─── Feed (транспорт) ──────────────────────────────────────────────────────────────────────────── */

function readIsoParam(params: URLSearchParams, key: string): string | undefined {
  const raw = readStringParam(params, key);
  if (raw !== undefined && Number.isNaN(parseIso(raw))) {
    throw validationFailed(`Некорректная метка времени «${key}»: ${raw}`);
  }
  return raw;
}

/** Окно ленты: (since, at] — since не включается, at включается. */
export type SessionFeedWindowQuery = { since?: string | null; at: string };

/**
 * Генератор ленты (entities/session → buildSessionFeed, T1.2-05): cardIssued из cardFlow,
 * cardOpened/statusChanged/cardCompleted из cardEvents, детерминированный порядок. shared не импортирует
 * entities — функцию передаёт серверная сборка handler'ов (src/app/mock-api).
 */
export type SessionFeedBuilder = (session: Session, window: SessionFeedWindowQuery) => SessionFeedEvent[];

/**
 * Кто читает ленту (T3.3-09; ТЗ §8). Обучающийся — только свои события своего занятия (чужой studentId в
 * query → 403). Преподаватель — только занятия, которые ведёт сам (чужое → 403): «нельзя вмешиваться в
 * работу других преподавателей». Администратор и анонимный вызов (контрактные тесты) — без ограничений.
 */
export type SessionFeedAccess = { viewer: MockViewer | null };

const FOREIGN_SESSION_MESSAGE = "Занятие ведёт другой преподаватель — мониторинг недоступен";
const NOT_IN_SESSION_MESSAGE = "Вы не участвуете в этом занятии";

function assertFeedAccess(session: Session, viewer: MockViewer | null): void {
  if (viewer?.role === "teacher" && session.teacherId !== viewer.userId) {
    throw forbidden(FOREIGN_SESSION_MESSAGE);
  }
  if (isStudentViewer(viewer) && !session.studentIds.includes(viewer.userId)) {
    throw forbidden(NOT_IN_SESSION_MESSAGE);
  }
}

/**
 * GET /sessions/[id]/feed?since=&at=&studentId= — события окна (since, at]; at по умолчанию — серверное
 * «сейчас». Реальное время эмулируется КЛИЕНТСКИМИ тиками (2–5 сек) по startedAt: клиент повторяет запрос с
 * since = предыдущий at; handler открытых соединений не держит (long-poll/SSE не нужен).
 * Мусорные since/at → 400; неизвестное занятие → 404; чужое занятие/курсант → 403.
 */
export function getSessionFeed(
  sessionId: string,
  params: URLSearchParams,
  buildFeed: SessionFeedBuilder,
  access?: SessionFeedAccess,
): SessionFeedResponse {
  const session = requireSession(sessionId);
  const viewer = access?.viewer ?? null;
  assertFeedAccess(session, viewer);
  const studentId = resolveStudentScope(viewer, readStringParam(params, "studentId"));
  const since = readIsoParam(params, "since");
  const at = readIsoParam(params, "at") ?? nowIso();
  const events = buildFeed(session, { since, at });
  return {
    sessionId,
    at,
    events: studentId ? events.filter((event) => event.studentId === studentId) : events,
  };
}
