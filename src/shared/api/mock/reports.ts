/*
 * GET /api/mock/reports?sessionId=&studentId= и GET /api/mock/attempts/[id]/evaluation (T1.1-17, T2.5-01).
 * Изоляция (ТЗ §8): обучающийся получает только свои отчёты/оценки — studentId берётся из мок-сессии,
 * чужой studentId в query → 403, групповой отчёт (данные всей группы) ему не отдаётся.
 * aiComment / groupInsights — ИИ-происхождение (мок): UI обязан показать бейдж «ИИ»
 * (spec/000-фронт/03-architecture.md → «Имитация ИИ»). Генерация оценки по эталону — T1.2-08 через AiGateway (T1.2-10).
 *
 * Источников отчёта два и контракт у них один: статика mocks/reports.json (занятие 16.09) и отчёты
 * занятий, проведённых в этом процессе, — их собирает reports-runtime.ts по попыткам занятия. Занятие
 * со статикой рантайм-сборку не запускает, поэтому статические отчёты остаются неизменными.
 */
import type { Evaluation, GroupReport, Report, ReportsResponse } from "../types";
import { readGroupReport, readReports } from "./readers";
import { ensureSessionReport, ensureStudentReports } from "./reports-runtime";
import type { RuntimeReportDeps } from "./reports-runtime";
import { recomputeReportScore } from "./reports-score";
import { readStringParam } from "./request";
import { HTTP_STATUS, MockApiError, notFound, validationFailed } from "./respond";
import { findStoredFeedback, findStoredGroupReport, listStoredReports } from "./store-reports";
import { findStoredAttempt, findStoredSession } from "./store-training";
import { assertOwnAttempt, resolveStudentScope } from "./viewer";
import type { MockViewer } from "./viewer";

/** Групповой свод занятия: статика mocks/reports.json либо сформированный по рантайм-данным. */
function toGroupReport(sessionId: string, reportIds: string[]): GroupReport | null {
  const staticReport = readGroupReport();
  const groupReport =
    staticReport.sessionId === sessionId ? structuredClone(staticReport) : findStoredGroupReport(sessionId);
  return groupReport ? { ...groupReport, reportIds } : null;
}

/**
 * Живое состояние отчёта: балл пересчитан по попыткам занятия (правка преподавателя приоритетна, T3.4-09)
 * и добавлена обратная связь преподавателя из store (T3.4-10).
 */
function toLiveReport(report: Report): Report {
  const live = recomputeReportScore(report, findStoredSession(report.sessionId));
  const teacherFeedback = findStoredFeedback(report.id);
  return teacherFeedback ? { ...live, teacherFeedback } : live;
}

/** Все отчёты мок-слоя: статика + сформированные по рантайм-данным (id не пересекаются). */
function readAllReports(): Report[] {
  return [...structuredClone([...readReports()]), ...listStoredReports()];
}

/**
 * Отчёты: по занятию (sessionId) и/или по курсанту (studentId). reportIds группового отчёта вычисляются
 * (в reports.json их нет); групповой отчёт — только в выборке «всё занятие» (не обучающемуся).
 * Отчёт завершённого рантайм-занятия формируется лениво, если его ещё не сформировал переход в `reported`;
 * повторный запрос отдаёт уже сформированный (идемпотентность).
 */
export async function getReports(
  params: URLSearchParams,
  viewer: MockViewer | null = null,
  deps: RuntimeReportDeps | null = null,
): Promise<ReportsResponse> {
  const sessionId = readStringParam(params, "sessionId");
  const studentId = resolveStudentScope(viewer, readStringParam(params, "studentId"));
  if (!sessionId && !studentId) throw validationFailed("Укажите параметр «sessionId» или «studentId»");
  if (sessionId && !findStoredSession(sessionId)) throw notFound(`Занятие «${sessionId}» не найдено`);
  if (deps) {
    if (sessionId) await ensureSessionReport(sessionId, deps);
    else if (studentId) await ensureStudentReports(studentId, deps);
  }
  const reports = readAllReports()
    .filter(
      (report) =>
        (!sessionId || report.sessionId === sessionId) &&
        (!studentId || report.student.studentId === studentId),
    )
    .map(toLiveReport);
  const groupReport =
    sessionId && !studentId
      ? toGroupReport(
          sessionId,
          reports.map((report) => report.id),
        )
      : null;
  return { reports, groupReport };
}

/**
 * Оценщик попытки: ИИ-шлюз (AiGateway.evaluateAttempt → entities/report getAttemptEvaluation, T1.2-08/10).
 * shared не импортирует entities — оценщик передаёт серверная сборка handler'ов (src/app/mock-api).
 * null — оценки нет и сгенерировать нельзя (нет эталона сценария).
 */
export type AttemptEvaluator = (attemptId: string) => Promise<Evaluation | null>;

/**
 * GET /attempts/[id]/evaluation: готовая оценка из занятия отдаётся как есть (teacherOverride приоритетен),
 * иначе — детерминированная мок-оценка по эталону. Нет попытки → 404 notFound; нет эталона → 404 evaluationPending;
 * попытка чужого курсанта для обучающегося → 403 forbidden.
 */
export async function getAttemptEvaluationById(
  attemptId: string,
  evaluate: AttemptEvaluator,
  viewer: MockViewer | null = null,
): Promise<Evaluation> {
  const stored = findStoredAttempt(attemptId);
  if (!stored) throw notFound(`Попытка «${attemptId}» не найдена`);
  assertOwnAttempt(viewer, stored.attempt.studentId);
  const evaluation = await evaluate(attemptId);
  if (!evaluation) {
    throw new MockApiError(HTTP_STATUS.notFound, "evaluationPending", "Оценка попытки ещё не готова");
  }
  return evaluation;
}
