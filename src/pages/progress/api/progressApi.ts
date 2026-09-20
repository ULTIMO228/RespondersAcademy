/*
 * Клиент данных «Мой прогресс» (T2.5-01): только свои данные курсанта сессии через мок-API.
 * studentId подставляется из сессии вызывающим хуком; мок-слой дополнительно сам берёт его из cookie-сессии
 * (чужой id → 403). Запросы: GET /reports?studentId=, GET /sessions?studentId= (per-student проекция),
 * GET /attempts/[id]/evaluation (оценка с teacherOverride), GET /cards/[id] (№ и тип), GET /scenarios (нормативы).
 */
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import {
  ApiError,
  getAttemptEvaluation,
  getCard,
  getStudentReports,
  listScenarios,
  listSessions,
} from "@/shared/api";
import type {
  CardDetails,
  CardEventContract,
  Evaluation,
  ReportContract,
  ReportsResponse,
  Scenario,
  ScenarioListQuery,
  SessionContract,
  SessionListQuery,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";

export type ProgressApi = {
  getStudentReports: (studentId: string, signal?: AbortSignal) => Promise<ReportsResponse>;
  listSessions: (query?: SessionListQuery, signal?: AbortSignal) => Promise<SessionContract[]>;
  getAttemptEvaluation: (attemptId: string, signal?: AbortSignal) => Promise<Evaluation>;
  getCard: (cardId: string, signal?: AbortSignal) => Promise<CardDetails>;
  listScenarios: (query?: ScenarioListQuery, signal?: AbortSignal) => Promise<Scenario[]>;
};

export const defaultProgressApi: ProgressApi = {
  getStudentReports,
  listSessions,
  getAttemptEvaluation,
  getCard,
  listScenarios,
};

export type EvaluatedAttempt = CardEventContract & { evaluation: Evaluation };

export type ProgressCardCaption = { number: string; type: string; href: string };

export type StudentProgressData = {
  studentId: string;
  /** Свои завершённые попытки с оценкой, по openedAt. */
  attempts: EvaluatedAttempt[];
  /** Попытки, оценка которых ещё не готова (404 evaluationPending). */
  pendingCount: number;
  reports: ReportContract[];
  captions: Record<string, ProgressCardCaption>;
  scenarios: Scenario[];
};

const EMPTY_CAPTION_TYPE = "—";

/** Оценка из GET /attempts/[id]/evaluation (приоритетна: учитывает правку преподавателя); не готова → null. */
async function loadEvaluation(api: ProgressApi, attempt: CardEventContract, signal?: AbortSignal) {
  // У незавершённой попытки (карточка ещё в работе) оценки нет — эндпоинт ответил бы 404 evaluationPending.
  if (!attempt.completedAt) return attempt.evaluation ?? null;
  try {
    return await api.getAttemptEvaluation(attempt.id, signal);
  } catch (error) {
    if (error instanceof ApiError && error.code === "evaluationPending") return attempt.evaluation ?? null;
    throw error;
  }
}

function toCaption(details: CardDetails, href: string): ProgressCardCaption {
  if (details.kind === "fixture") {
    return { number: String(details.card.number), type: details.card.what.finalType, href };
  }
  return { number: details.card.id, type: details.card.group ?? EMPTY_CAPTION_TYPE, href };
}

/** № и тип карточки: учебная c-NNN показывается фикстурой ПОВ-112, если она сопоставлена. */
async function loadCaption(api: ProgressApi, cardId: string, signal?: AbortSignal) {
  const resolvedId = TRAINING_CARD_FIXTURE_IDS[cardId] ?? cardId;
  const href = ROUTES.armCard(resolvedId);
  try {
    return toCaption(await api.getCard(resolvedId, signal), href);
  } catch (error) {
    if (error instanceof ApiError && error.code === "notFound") {
      return { number: cardId, type: EMPTY_CAPTION_TYPE, href };
    }
    throw error;
  }
}

async function loadCaptions(api: ProgressApi, cardIds: string[], signal?: AbortSignal) {
  const unique = [...new Set(cardIds)];
  const captions = await Promise.all(unique.map((cardId) => loadCaption(api, cardId, signal)));
  return Object.fromEntries(unique.map((cardId, index) => [cardId, captions[index]]));
}

/** Попытки курсанта из занятий (защита в глубину: фильтр по своему id и на клиенте). */
function collectOwnAttempts(sessions: SessionContract[], studentId: string): CardEventContract[] {
  return sessions
    .flatMap((session) => session.cardEvents)
    .filter((attempt) => attempt.studentId === studentId)
    .sort((left, right) => left.openedAt.localeCompare(right.openedAt));
}

export async function loadStudentProgress(
  studentId: string,
  api: ProgressApi = defaultProgressApi,
  signal?: AbortSignal,
): Promise<StudentProgressData> {
  const [reportsResponse, sessions, scenarios] = await Promise.all([
    api.getStudentReports(studentId, signal),
    api.listSessions({ studentId }, signal),
    api.listScenarios(undefined, signal),
  ]);
  const ownAttempts = collectOwnAttempts(sessions, studentId);
  const [evaluations, captions] = await Promise.all([
    Promise.all(ownAttempts.map((attempt) => loadEvaluation(api, attempt, signal))),
    loadCaptions(
      api,
      ownAttempts.map((attempt) => attempt.cardId),
      signal,
    ),
  ]);
  const attempts = ownAttempts.flatMap((attempt, index) => {
    const evaluation = evaluations[index];
    return evaluation ? [{ ...attempt, evaluation }] : [];
  });
  return {
    studentId,
    attempts,
    pendingCount: ownAttempts.length - attempts.length,
    reports: reportsResponse.reports.filter((report) => report.student.studentId === studentId),
    captions,
    scenarios,
  };
}
