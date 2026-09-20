/*
 * Действия преподавателя над отчётом (T3.4-09, T3.4-10):
 *   POST /attempts/[id]/evaluation — экспертная оценка (teacherOverride). Приоритет за преподавателем
 *     (Q&A в3): итог попытки и балл курсанта считаются по правке, оценка ИИ остаётся в Evaluation рядом.
 *     Каждая правка пишется в мок-аудит «было/стало» (ТЗ §8) — она видна в /admin/system → журналы.
 *   POST /reports/feedback — обратная связь курсанту (комментарий + рекомендации), читается в /arm/progress.
 */
import type { Evaluation, ReportFeedback, TeacherOverride } from "../types";
import { readReports } from "./readers";
import type { AttemptEvaluator } from "./reports";
import { getAttemptEvaluationById } from "./reports";
import { readJsonBody } from "./request";
import { forbidden, notFound, validationFailed } from "./respond";
import { appendAuditEntry, findStoredUser } from "./store-admin";
import { findStoredReport, upsertStoredFeedback } from "./store-reports";
import { updateStoredAttempt } from "./store-training";
import { nowIso } from "./time";
import type { MockViewer } from "./viewer";

const MIN_SCORE = 0;
const MAX_SCORE = 100;

export const AUDIT_ACTION_EVALUATION_OVERRIDE = "evaluation.override";
export const TEACHER_ONLY_MESSAGE = "Действие доступно преподавателю и администратору";

/** Автор действия: id из тела (как в админке), роль сверяется по users; чужая роль → 403. */
function readTeacher(body: Record<string, unknown>) {
  const teacherId = typeof body.teacherId === "string" ? body.teacherId.trim() : "";
  if (!teacherId) throw validationFailed("Укажите «teacherId»");
  const teacher = findStoredUser(teacherId);
  if (!teacher || (teacher.role !== "teacher" && teacher.role !== "admin")) {
    throw forbidden(TEACHER_ONLY_MESSAGE);
  }
  return teacher;
}

function readScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_SCORE || value > MAX_SCORE) {
    throw validationFailed(`Балл преподавателя — целое число от ${MIN_SCORE} до ${MAX_SCORE}`);
  }
  return value;
}

function readComment(value: unknown): string {
  const comment = typeof value === "string" ? value.trim() : "";
  if (!comment) throw validationFailed("Комментарий к правке оценки обязателен");
  return comment;
}

function describeOverride(
  teacherName: string,
  attemptId: string,
  before: number,
  override: TeacherOverride,
): string {
  return (
    `Оценка изменена преподавателем ${teacherName} (попытка ${attemptId}): ` +
    `было ${before} → стало ${override.score}. Комментарий: ${override.comment}`
  );
}

/**
 * Правка оценки: базовая оценка берётся тем же путём, что и GET (готовая из занятия либо мок-оценка ИИ),
 * затем в неё записывается teacherOverride. Ответ — итоговая оценка с правкой.
 */
export async function overrideAttemptEvaluation(
  attemptId: string,
  request: Request,
  evaluate: AttemptEvaluator,
  viewer: MockViewer | null = null,
): Promise<Evaluation> {
  const body = await readJsonBody(request);
  const teacher = readTeacher(body);
  const score = readScore(body.score);
  const comment = readComment(body.comment);
  const current = await getAttemptEvaluationById(attemptId, evaluate, viewer);
  const before = current.teacherOverride?.score ?? current.totalScore;
  const teacherOverride: TeacherOverride = { score, comment, at: nowIso(), by: teacher.id };
  const evaluation: Evaluation = { ...current, teacherOverride };
  const updated = updateStoredAttempt(attemptId, (draft) => {
    draft.evaluation = evaluation;
  });
  if (!updated) throw notFound(`Попытка «${attemptId}» не найдена`);
  appendAuditEntry({
    userId: teacher.id,
    role: teacher.role,
    action: AUDIT_ACTION_EVALUATION_OVERRIDE,
    details: describeOverride(teacher.fullName, attemptId, before, teacherOverride),
  });
  return evaluation;
}

function readRecommendations(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw validationFailed("«recommendations» — список строк");
  }
  return (value as string[]).map((item) => item.trim()).filter((item) => item.length > 0);
}

/** Обратная связь по отчёту курсанта: пустой комментарий не принимается, повтор заменяет предыдущий. */
export async function saveReportFeedback(
  request: Request,
  viewer: MockViewer | null = null,
): Promise<ReportFeedback> {
  const body = await readJsonBody(request);
  if (viewer?.role === "student") throw forbidden(TEACHER_ONLY_MESSAGE);
  const teacher = readTeacher(body);
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  // Отчёт — статический (reports.json) либо сформированный по рантайм-данным занятия (reports-runtime.ts).
  const report = readReports().find((candidate) => candidate.id === reportId) ?? findStoredReport(reportId);
  if (!report) throw notFound(`Отчёт «${reportId}» не найден`);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) throw validationFailed("Комментарий к результату обязателен");
  return upsertStoredFeedback({
    reportId: report.id,
    sessionId: report.sessionId,
    studentId: report.student.studentId,
    text,
    recommendations: readRecommendations(body.recommendations),
    at: nowIso(),
    by: teacher.id,
    byName: teacher.fullName,
  });
}
