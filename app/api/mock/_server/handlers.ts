/*
 * Серверная сборка route handlers мок-слоя, которым нужна доменная логика entities. src/shared/api/mock
 * не может импортировать entities (FSD), а корневой app/ (Next App Router, вне src/) — может; приватная папка
 * `_server` не становится роутом. route.ts соответствующих эндпоинтов — одна строка реэкспорта отсюда.
 *   POST /cards/[id]/status          — машина статусов ДДС из reference.ddsStatuses (T1.2-01);
 *   GET  /cards                      — расширенный поиск filterCards (T1.2-04);
 *   GET  /sessions/[id]/feed         — лента buildSessionFeed (T1.2-05) + доступ монитора (T3.3-09);
 *   GET  /attempts/[id]/evaluation   — оценка через ИИ-шлюз → getAttemptEvaluation (T1.2-08, T1.2-10);
 *   GET  /reports, GET /sessions     — изоляция обучающегося по мок-сессии (readRequestViewer, T2.5-01);
 *                                      /sessions — per-student проекция projectSessionForStudent;
 *                                      /reports и /reports/journal — ещё и сборка отчёта занятия
 *                                      по рантайм-данным (./reports.ts);
 *   POST /sessions/[id]/control      — «Сформировать отчёт»: reported + сборка отчёта занятия;
 *   POST /scenarios/generate         — мок-генерация сценариев через ИИ-шлюз (T3.1-06);
 *   POST /grammar-check              — проверка грамматики через ИИ-шлюз (T3.1-08).
 */
import { filterCards } from "@/entities/incident";
import { createDdsStatusMachine } from "@/entities/service";
import type { DdsStatusMachine } from "@/entities/service";
import { buildSessionFeed, projectSessionForStudent } from "@/entities/session";
import { readReference } from "@/shared/api/mock";
import {
  createGetAttemptEvaluationHandler,
  createGetCardsHandler,
  createGetReportJournalHandler,
  createGetReportsHandler,
  createGetSessionFeedHandler,
  createGetSessionsHandler,
  createGetUsersHandler,
  createPostAttemptEvaluationHandler,
  createPostCardStatusHandler,
  createPostGrammarCheckHandler,
  createPostReportFeedbackHandler,
  createPostScenarioGenerateHandler,
  createPostSessionControlHandler,
} from "@/shared/api/mock/routes";

import { getServerAiGateway } from "./ai-gateway";
import { buildSessionReport, getRuntimeReportDeps } from "./reports";
import { readRequestViewer } from "./viewer";

let ddsStatusMachine: DdsStatusMachine | undefined;

/** Граф — данные справочника (кэш ридера неизменяем), поэтому машина строится один раз. */
function getDdsStatusMachine(): DdsStatusMachine {
  ddsStatusMachine ??= createDdsStatusMachine(readReference().ddsStatuses);
  return ddsStatusMachine;
}

export const handlePostCardStatus = createPostCardStatusHandler((from, to, payload) =>
  getDdsStatusMachine().assertTransition(from, to, payload),
);

export const handleGetCards = createGetCardsHandler(filterCards);

export const handleGetSessionFeed = createGetSessionFeedHandler(buildSessionFeed, readRequestViewer);

export const handleGetAttemptEvaluation = createGetAttemptEvaluationHandler(
  async (attemptId) => (await getServerAiGateway().evaluateAttempt(attemptId)).data,
  readRequestViewer,
);

/** Правка оценки преподавателем: базовая оценка берётся тем же ИИ-шлюзом, что и в GET (T3.4-09). */
export const handlePostAttemptEvaluation = createPostAttemptEvaluationHandler(
  async (attemptId) => (await getServerAiGateway().evaluateAttempt(attemptId)).data,
  readRequestViewer,
);

export const handleGetReports = createGetReportsHandler(readRequestViewer, getRuntimeReportDeps());

export const handleGetReportJournal = createGetReportJournalHandler(
  readRequestViewer,
  getRuntimeReportDeps(),
);

/** POST /sessions/[id]/control: переход finished → reported формирует отчёт занятия (T3.2-12, ТЗ §7). */
export const handlePostSessionControl = createPostSessionControlHandler(buildSessionReport);

export const handlePostReportFeedback = createPostReportFeedbackHandler(readRequestViewer);

export const handleGetSessions = createGetSessionsHandler(readRequestViewer, projectSessionForStudent);

/** GET /users — состав учебных групп мастера занятия и мониторинга; обучающемуся — 403 (T3.2-03). */
export const handleGetUsers = createGetUsersHandler(readRequestViewer);

/* Конструктор сценариев (фаза 3.1): «Сгенерировать (ИИ)» и «Проверить грамматику» — через тот же шлюз. */
export const handlePostScenarioGenerate = createPostScenarioGenerateHandler(getServerAiGateway);

export const handlePostGrammarCheck = createPostGrammarCheckHandler(getServerAiGateway);
