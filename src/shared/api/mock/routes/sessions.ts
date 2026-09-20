/*
 * Route handlers /api/mock/sessions, /[id]/start, /[id]/stop, /[id]/feed (логика — ../sessions.ts)
 * и /[id]/control — управление во время занятия (логика — ../session-control.ts).
 */
import { readSearchParams } from "../request";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";
import { getSessionControl, postSessionControl } from "../session-control";
import type { SessionReportBuilder } from "../session-control";
import { createSession, getSessionFeed, listSessions, startSession, stopSession } from "../sessions";
import type { SessionFeedBuilder, SessionProjector } from "../sessions";
import type { ViewerResolver } from "../viewer";

/**
 * GET /sessions; резолвер мок-сессии и per-student проекцию передаёт серверная сборка (app/api/mock/_server):
 * обучающемуся — только свои занятия, выдачи и попытки.
 */
export function createGetSessionsHandler(resolveViewer: ViewerResolver, project: SessionProjector) {
  return withErrorHandling((request: Request) =>
    jsonOk(listSessions(readSearchParams(request), { viewer: resolveViewer(request), project })),
  );
}

export const handlePostSession = withErrorHandling(async (request: Request) =>
  jsonCreated(await createSession(request)),
);

export const handlePostSessionStart = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(startSession((await params).id)),
);

export const handlePostSessionStop = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(stopSession((await params).id)),
);

/** GET /sessions/[id]/control — занятие, настройки мастера и состояние выдачи (T3.2-11). */
export const handleGetSessionControl = withErrorHandling(
  async (_request: Request, { params }: RouteContext) => jsonOk(getSessionControl((await params).id)),
);

/**
 * POST /sessions/[id]/control — пауза выдачи, внеочередная карточка, отчёт (T3.2-11, T3.2-12).
 * Сборщик отчёта (reports-runtime.ts с доменной оценкой) передаёт серверная сборка app/api/mock/_server.
 */
export function createPostSessionControlHandler(buildReport: SessionReportBuilder | null = null) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) =>
    jsonOk(await postSessionControl((await params).id, request, buildReport)),
  );
}

/** Управление занятием без сборки отчёта (переход в reported меняет только статус). */
export const handlePostSessionControl = createPostSessionControlHandler();

/**
 * GET /sessions/[id]/feed; генератор ленты и резолвер мок-сессии передаёт серверная сборка
 * (app/api/mock/_server): преподавателю — только своё занятие, обучающемуся — только свои события (T3.3-09).
 */
export function createGetSessionFeedHandler(buildFeed: SessionFeedBuilder, resolveViewer: ViewerResolver) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) =>
    jsonOk(
      getSessionFeed((await params).id, readSearchParams(request), buildFeed, {
        viewer: resolveViewer(request),
      }),
    ),
  );
}
