/*
 * Автономный режим оценки и реестра ошибок (app/api/v1/ai/attempts/**, sessions/**, me/errors; фронт без BACKEND_URL).
 * Данные — те же, что у мок-оценки попытки (`AttemptEvaluator` → ИИ-шлюз мок-слоя → mocks/sessions.json и рантайм-store):
 * новой «модели» нет, оценка и ошибки только переупаковываются в контракт /api/v1/ai. Арбитраж преподавателя пишет
 * teacherOverride в оценку попытки (приоритет за преподавателем, Q&A в3) и запись в мок-аудит.
 * Метка автономного режима — в modelReleaseId/assessorVersion (isStandaloneAiRelease) и detector "standalone_mock".
 */
import { STANDALONE_AI_REASON, STANDALONE_AI_RELEASE } from "../ai-standalone-marker";
import type {
  AssessmentAxes,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  Evaluation,
  ErrorRecord,
  ErrorRecordCategory,
  PaginatedErrorRecordsResponse,
  SessionErrorSummaryResponse,
  StudentErrorsResponse,
  TeacherOverride,
} from "../types";
import type { AttemptEvaluator } from "./reports";
import { readJsonBody, readIntParam, readSearchParams, readStringParam } from "./request";
import {
  conflict,
  forbidden,
  MockApiError,
  HTTP_STATUS,
  notFound,
  unauthorized,
  validationFailed,
} from "./respond";
import { appendAuditEntry, findStoredUser } from "./store-admin";
import {
  findStoredAttempt,
  findStoredSession,
  listStoredSessions,
  updateStoredAttempt,
} from "./store-training";
import { nowIso } from "./time";
import { assertOwnAttempt } from "./viewer";
import type { MockViewer } from "./viewer";

const SESSION_REQUIRED = "Войдите в систему, чтобы просмотреть AI-ресурсы";
const TEACHER_ONLY_REVIEW = "Разбор оценки доступен только преподавателю и администратору";
const TEACHER_ONLY_RESOLVE = "Разрешение спора оценки доступно только преподавателю и администратору";
const TEACHER_ONLY_SESSION = "Нет доступа к занятию";
const ETALON_VERSION = "standalone-etalon/1";
const AXES: AssessmentStateResponse["availableAxes"] = [
  "timeScore",
  "correctnessScore",
  "grammarScore",
  "semanticScore",
];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const AUDIT_ACTION_ASSESSMENT_RESOLVE = "evaluation.override";

function requireViewer(viewer: MockViewer | null): MockViewer {
  if (!viewer) throw unauthorized(SESSION_REQUIRED);
  return viewer;
}

async function loadEvaluation(
  attemptId: string,
  evaluate: AttemptEvaluator,
  viewer: MockViewer,
): Promise<{ evaluation: Evaluation; studentId: string; at: string }> {
  const stored = findStoredAttempt(attemptId);
  if (!stored) throw notFound(`Попытка «${attemptId}» не найдена`);
  assertOwnAttempt(viewer, stored.attempt.studentId);
  const evaluation = await evaluate(attemptId);
  if (!evaluation) {
    throw new MockApiError(HTTP_STATUS.notFound, "evaluationPending", "Оценка попытки ещё не готова");
  }
  return {
    evaluation,
    studentId: stored.attempt.studentId,
    at: stored.attempt.completedAt || stored.attempt.openedAt,
  };
}

function statusOf(evaluation: Evaluation): AssessmentStateResponse["status"] {
  return evaluation.teacherOverride ? "final" : (evaluation.status ?? "preliminary");
}

function totalOf(evaluation: Evaluation): number | null {
  const status = statusOf(evaluation);
  if (status === "pending" || status === "review_required") return null;
  return evaluation.teacherOverride?.score ?? evaluation.totalScore;
}

function axesOf(evaluation: Evaluation): AssessmentAxes {
  return {
    timeScore: evaluation.timeScore,
    correctnessScore: evaluation.correctnessScore,
    grammarScore: evaluation.grammarScore,
    semanticScore: evaluation.semanticScore,
  };
}

function toRecords(attemptId: string, evaluation: Evaluation, at: string): ErrorRecord[] {
  return evaluation.errors.map((error, index) => ({
    id: `err-${attemptId}-${String(index + 1).padStart(2, "0")}`,
    attemptId,
    ruleId: error.type,
    severity: error.severity,
    message: error.message,
    sourceRef: `${STANDALONE_AI_RELEASE}:${error.type}`,
    detector: "standalone_mock",
    category: categoryOf(error.type),
    fixed: false,
    etalonVersion: ETALON_VERSION,
    assessorVersion: STANDALONE_AI_RELEASE,
    createdAt: at,
  }));
}

function categoryOf(type: string): ErrorRecordCategory {
  const lowered = type.toLowerCase();
  if (lowered.includes("gramm") || lowered.includes("spell")) return "grammar";
  if (lowered.includes("service") || lowered.includes("call")) return "services";
  if (lowered.includes("status")) return "status_flow";
  if (lowered.includes("semantic") || lowered.includes("meaning")) return "semantic";
  return "card_completion";
}

/** GET /ai/attempts/[id]/assessment-state — доступно преподавателю, администратору и владельцу попытки. */
export async function getAssessmentStateFor(
  attemptId: string,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<AssessmentStateResponse> {
  const viewer = requireViewer(viewerOrNull);
  const { evaluation, at } = await loadEvaluation(attemptId, evaluate, viewer);
  return {
    attemptId,
    mode: "dds",
    status: statusOf(evaluation),
    revision: evaluation.revision ?? 1,
    availableAxes: AXES,
    axes: axesOf(evaluation),
    totalScore: totalOf(evaluation),
    reasonCode: statusOf(evaluation) === "review_required" ? "review_pending" : STANDALONE_AI_REASON,
    updatedAt: evaluation.teacherOverride?.at ?? at,
  };
}

/** GET /ai/attempts/[id]/review — только преподаватель и администратор. */
export async function getAssessmentReviewFor(
  attemptId: string,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<AssessmentReviewResponse> {
  const viewer = requireViewer(viewerOrNull);
  if (viewer.role === "student") throw forbidden(TEACHER_ONLY_REVIEW);
  const { evaluation, at } = await loadEvaluation(attemptId, evaluate, viewer);
  const override = evaluation.teacherOverride;
  const teacherOverride: AssessmentReviewResponse["teacherOverride"] = override
    ? { teacherId: override.by, score: override.score, comment: override.comment, at: override.at }
    : null;
  return {
    attemptId,
    mode: "dds",
    status: statusOf(evaluation),
    revision: evaluation.revision ?? 1,
    availableAxes: AXES,
    axes: axesOf(evaluation),
    totalScore: totalOf(evaluation),
    etalonVersion: ETALON_VERSION,
    assessorVersion: STANDALONE_AI_RELEASE,
    modelReleaseId: STANDALONE_AI_RELEASE,
    semanticReviews: [],
    errorRecords: toRecords(attemptId, evaluation, at),
    teacherOverride,
    updatedAt: override?.at ?? at,
  };
}

function readResolveScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw validationFailed("Балл преподавателя — целое число от 0 до 100");
  }
  return value;
}

/** POST /ai/attempts/[id]/resolve — арбитраж: итоговая ревизия final с приоритетом преподавателя. */
export async function resolveAssessmentFor(
  attemptId: string,
  request: Request,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<{ status: "final"; revision: number; totalScore: number }> {
  const viewer = requireViewer(viewerOrNull);
  if (viewer.role === "student") throw forbidden(TEACHER_ONLY_RESOLVE);
  const teacher = findStoredUser(viewer.userId);
  if (!teacher) throw notFound("Пользователь преподавателя не найден");
  const body = await readJsonBody(request);
  const expectedRevision = body.expectedRevision;
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw validationFailed("«expectedRevision» — номер ревизии, целое число от 1");
  }
  const score = readResolveScore(body.score);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!comment) throw validationFailed("Комментарий к решению преподавателя обязателен");
  if (typeof body.requestId !== "string" || !body.requestId.trim()) {
    throw validationFailed("Некорректное поле «requestId»");
  }
  if (body.semanticDecisions !== undefined && !Array.isArray(body.semanticDecisions)) {
    throw validationFailed("«semanticDecisions» — список решений");
  }
  const { evaluation } = await loadEvaluation(attemptId, evaluate, viewer);
  const current = evaluation.revision ?? 1;
  if (expectedRevision !== current) {
    throw conflict(`Устаревшая ревизия оценки: текущая — ${current}`);
  }
  const before = evaluation.teacherOverride?.score ?? evaluation.totalScore;
  const teacherOverride: TeacherOverride = { score, comment, at: nowIso(), by: viewer.userId };
  const updated = updateStoredAttempt(attemptId, (draft) => {
    draft.evaluation = { ...evaluation, revision: current + 1, status: "final", teacherOverride };
  });
  if (!updated) throw notFound(`Попытка «${attemptId}» не найдена`);
  appendAuditEntry({
    userId: teacher.id,
    role: teacher.role,
    action: AUDIT_ACTION_ASSESSMENT_RESOLVE,
    details:
      `Оценка изменена преподавателем ${teacher.fullName} (попытка ${attemptId}): ` +
      `было ${before} → стало ${score}. Комментарий: ${comment}`,
  });
  return { status: "final", revision: current + 1, totalScore: score };
}

/** Ошибки попыток занятия из мок-оценок; попытки без оценки пропускаются. */
async function collectSessionRecords(
  sessionId: string,
  evaluate: AttemptEvaluator,
  viewer: MockViewer,
): Promise<{ records: ErrorRecord[]; studentByAttempt: Record<string, string> }> {
  const session = findStoredSession(sessionId);
  if (!session) throw notFound(`Занятие «${sessionId}» не найдено`);
  if (viewer.role === "student") throw forbidden(TEACHER_ONLY_SESSION);
  if (viewer.role === "teacher" && session.teacherId !== viewer.userId) throw forbidden(TEACHER_ONLY_SESSION);
  const records: ErrorRecord[] = [];
  const studentByAttempt: Record<string, string> = {};
  for (const attempt of session.cardEvents) {
    const evaluation = await evaluate(attempt.id);
    if (!evaluation) continue;
    studentByAttempt[attempt.id] = attempt.studentId;
    records.push(...toRecords(attempt.id, evaluation, attempt.completedAt || attempt.openedAt));
  }
  return { records, studentByAttempt };
}

function tally<TKey extends string>(values: readonly TKey[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
}

/** GET /ai/sessions/[id]/errors?studentId&detector&severity&page&pageSize. */
export async function getSessionErrorsFor(
  sessionId: string,
  request: Request,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<PaginatedErrorRecordsResponse> {
  const viewer = requireViewer(viewerOrNull);
  const params = readSearchParams(request);
  const page = readIntParam(params, "page", { fallback: 1, min: 1 });
  const pageSize = readIntParam(params, "pageSize", {
    fallback: DEFAULT_PAGE_SIZE,
    min: 1,
    max: MAX_PAGE_SIZE,
  });
  const studentId = readStringParam(params, "studentId");
  const detector = readStringParam(params, "detector");
  const severity = readStringParam(params, "severity");
  const { records, studentByAttempt } = await collectSessionRecords(sessionId, evaluate, viewer);
  const filtered = records.filter(
    (record) =>
      (!studentId || studentByAttempt[record.attemptId] === studentId) &&
      (!detector || record.detector === detector) &&
      (!severity || record.severity === severity),
  );
  const first = (page - 1) * pageSize;
  return { items: filtered.slice(first, first + pageSize), total: filtered.length, page, pageSize };
}

/** GET /ai/sessions/[id]/error-summary. */
export async function getSessionErrorSummaryFor(
  sessionId: string,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<SessionErrorSummaryResponse> {
  const viewer = requireViewer(viewerOrNull);
  const { records, studentByAttempt } = await collectSessionRecords(sessionId, evaluate, viewer);
  const severities = tally(records.map((record) => record.severity));
  return {
    sessionId,
    totalErrors: records.length,
    critical: severities.critical ?? 0,
    major: severities.major ?? 0,
    minor: severities.minor ?? 0,
    byCategory: tally(records.map((record) => record.category)),
    byRule: tally(records.map((record) => record.ruleId)),
    byDetector: tally(records.map((record) => record.detector)),
    byStudent: tally(records.map((record) => studentByAttempt[record.attemptId] ?? "unknown")),
  };
}

/** GET /ai/me/errors?sessionId — ошибки попыток текущего пользователя, сгруппированные по попыткам. */
export async function getMyErrorsFor(
  request: Request,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<StudentErrorsResponse> {
  const viewer = requireViewer(viewerOrNull);
  const sessionId = readStringParam(readSearchParams(request), "sessionId");
  const sessions = listStoredSessions().filter((session) => !sessionId || session.id === sessionId);
  const attempts: StudentErrorsResponse["attempts"] = [];
  for (const session of sessions) {
    for (const attempt of session.cardEvents.filter((event) => event.studentId === viewer.userId)) {
      const evaluation = await evaluate(attempt.id);
      if (!evaluation) continue;
      const errors = toRecords(attempt.id, evaluation, attempt.completedAt || attempt.openedAt);
      attempts.push({
        attemptId: attempt.id,
        cardId: attempt.cardId,
        mode: "dds",
        totalErrors: errors.length,
        errors,
      });
    }
  }
  const all = attempts.flatMap((item) => item.errors);
  const severities = tally(all.map((record) => record.severity));
  return {
    studentId: viewer.userId,
    ...(sessionId ? { sessionId } : {}),
    totalErrors: all.length,
    critical: severities.critical ?? 0,
    major: severities.major ?? 0,
    minor: severities.minor ?? 0,
    attempts,
  };
}
