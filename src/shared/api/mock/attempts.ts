/*
 * Попытки курсанта по карточкам (T2.3-01): открытие карточки создаёт или продолжает CardEvent в занятии,
 * ход отработки (статусы, «Действие диспетчера», завершение) дописывается в ту же попытку. Попытку находят
 * софтфон (POST /cards/[id]/calls), лента занятия, мок-оценка (GET /attempts/[id]/evaluation).
 * Занятие попытки: идущее занятие курсанта; нет такого — создаётся занятие самостоятельной практики.
 */
import type {
  AttemptProgressRequest,
  CardAttemptRequest,
  CardAttemptResponse,
  CardEvent,
  CardStatusMark,
  DdsStatus,
  Session,
} from "../types";
import { requireCard } from "./cards";
import { isRecord, readJsonBody } from "./request";
import { notFound, validationFailed } from "./respond";
import { MOCK_ID_PREFIX, nextMockId } from "./store";
import {
  insertStoredSession,
  listStoredScenarios,
  listStoredSessions,
  updateStoredAttempt,
  updateStoredSession,
} from "./store-training";
import { nowIso, parseIso } from "./time";

const RUNNING_STATE: Session["state"] = "running";

function readIso(value: unknown, key: string): string {
  if (typeof value !== "string" || Number.isNaN(parseIso(value))) {
    throw validationFailed(`Поле «${key}» должно быть датой ISO 8601`);
  }
  return value;
}

function parseAttemptRequest(body: Record<string, unknown>): CardAttemptRequest {
  if (typeof body.studentId !== "string" || body.studentId.trim() === "") {
    throw validationFailed("Укажите курсанта (studentId)");
  }
  const request: CardAttemptRequest = { studentId: body.studentId.trim() };
  if (body.issuedAt !== undefined && body.issuedAt !== null)
    request.issuedAt = readIso(body.issuedAt, "issuedAt");
  return request;
}

/** Существующая попытка курсанта по карточке: сначала идущее занятие, затем самое позднее. */
function findExistingAttempt(sessions: Session[], cardId: string, studentId: string) {
  const ordered = [...sessions].sort((left, right) => {
    const running = Number(right.state === RUNNING_STATE) - Number(left.state === RUNNING_STATE);
    return running || parseIso(right.startedAt) - parseIso(left.startedAt);
  });
  for (const session of ordered) {
    const attempt = session.cardEvents.findLast(
      (event) => event.cardId === cardId && event.studentId === studentId,
    );
    if (attempt) return { session, attempt };
  }
  return undefined;
}

function scenarioIdsForCard(cardId: string): string[] {
  return listStoredScenarios()
    .filter((scenario) => scenario.cardIds.includes(cardId))
    .map((scenario) => scenario.id);
}

/**
 * Идущее занятие курсанта или новое занятие самостоятельной практики (без ленты выдачи).
 * Идущих занятий у курсанта может быть несколько (занятие преподавателя рядом с ранее запущенным):
 * попытка принадлежит тому, которое эту карточку выдало, — иначе лента и монитор занятия её не увидят.
 */
function resolveSession(sessions: Session[], cardId: string, studentId: string): Session {
  const running = sessions.filter(
    (session) => session.state === RUNNING_STATE && session.studentIds.includes(studentId),
  );
  const issuer = running.find((session) =>
    session.cardFlow.some((item) => item.cardId === cardId && item.studentId === studentId),
  );
  const current = issuer ?? running[0];
  if (current) return current;
  const latest = sessions
    .filter((session) => session.studentIds.includes(studentId))
    .sort((left, right) => parseIso(right.startedAt) - parseIso(left.startedAt))[0];
  return insertStoredSession({
    id: nextMockId(MOCK_ID_PREFIX.session),
    teacherId: latest?.teacherId ?? "",
    studentIds: [studentId],
    scenarioIds: scenarioIdsForCard(cardId),
    mode: "practice",
    cardSource: "generated",
    cardFlow: [],
    state: RUNNING_STATE,
    startedAt: nowIso(),
    finishedAt: null,
    cardEvents: [],
  });
}

function reactionMs(openedAt: string, issuedAt: string | undefined): number {
  if (!issuedAt) return 0;
  return Math.max(0, parseIso(openedAt) - parseIso(issuedAt));
}

function createAttempt(session: Session, cardId: string, request: CardAttemptRequest): CardEvent {
  const openedAt = nowIso();
  const issuedAt =
    request.issuedAt ??
    session.cardFlow.find((item) => item.cardId === cardId && item.studentId === request.studentId)?.issuedAt;
  const attempt: CardEvent = {
    id: nextMockId(MOCK_ID_PREFIX.attempt),
    cardId,
    studentId: request.studentId,
    openedAt,
    primaryReactionMs: reactionMs(openedAt, issuedAt),
    statuses: [],
    servicesCalled: [],
    completedAt: "",
    fullProcessingMs: 0,
    enteredText: {},
    calls: [],
  };
  const extraScenarios = scenarioIdsForCard(cardId).filter((id) => !session.scenarioIds.includes(id));
  updateStoredSession(session.id, (draft) => {
    draft.cardEvents.push(attempt);
    draft.scenarioIds.push(...extraScenarios);
  });
  return attempt;
}

/** POST /cards/[id]/attempt — идемпотентно: повторное открытие возвращает ту же попытку (created: false). */
export async function openCardAttempt(cardId: string, httpRequest: Request): Promise<CardAttemptResponse> {
  requireCard(cardId);
  const request = parseAttemptRequest(await readJsonBody(httpRequest));
  const sessions = listStoredSessions();
  const existing = findExistingAttempt(sessions, cardId, request.studentId);
  if (existing) return { sessionId: existing.session.id, attempt: existing.attempt, created: false };
  const session = resolveSession(sessions, cardId, request.studentId);
  return { sessionId: session.id, attempt: createAttempt(session, cardId, request), created: true };
}

function parseMark(value: unknown): CardStatusMark {
  if (!isRecord(value) || typeof value.ddsStatus !== "string" || value.ddsStatus.trim() === "") {
    throw validationFailed("Статус попытки: нужны ddsStatus и at");
  }
  const mark: CardStatusMark = {
    ddsStatus: value.ddsStatus as DdsStatus,
    at: readIso(value.at, "status.at"),
  };
  if (typeof value.comment === "string" && value.comment.trim()) mark.comment = value.comment.trim();
  if (typeof value.dutyNumber === "string" && value.dutyNumber.trim())
    mark.dutyNumber = value.dutyNumber.trim();
  return mark;
}

function parseEnteredText(value: unknown): Record<string, string> {
  const valid = isRecord(value) && Object.values(value).every((text) => typeof text === "string");
  if (!valid) throw validationFailed("Поле «enteredText» должно быть объектом строк");
  return value as Record<string, string>;
}

function parseProgress(body: Record<string, unknown>): AttemptProgressRequest {
  const request: AttemptProgressRequest = {};
  if (body.status !== undefined) request.status = parseMark(body.status);
  if (body.enteredText !== undefined) request.enteredText = parseEnteredText(body.enteredText);
  if (body.completedAt !== undefined) request.completedAt = readIso(body.completedAt, "completedAt");
  return request;
}

/** POST /attempts/[id]/progress — дописывает статус / текст / завершение в попытку; 404 — нет попытки. */
export async function recordAttemptProgress(attemptId: string, httpRequest: Request): Promise<CardEvent> {
  const request = parseProgress(await readJsonBody(httpRequest));
  const updated = updateStoredAttempt(attemptId, (draft) => {
    if (request.status) draft.statuses.push(request.status);
    if (request.enteredText) Object.assign(draft.enteredText, request.enteredText);
    if (request.completedAt && !draft.completedAt) {
      draft.completedAt = request.completedAt;
      draft.fullProcessingMs = Math.max(0, parseIso(request.completedAt) - parseIso(draft.openedAt));
    }
  });
  if (!updated) throw notFound(`Попытка «${attemptId}» не найдена`);
  return updated;
}
