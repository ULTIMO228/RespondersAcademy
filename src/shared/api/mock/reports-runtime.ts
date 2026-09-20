/*
 * Формирование отчёта занятия по рантайм-данным (ТЗ §7, §10 сценарий Б).
 *
 * В mocks/reports.json лежат отчёты единственного занятия 16.09; у занятия, проведённого в текущем
 * процессе (мастер → работа курсанта → «Завершить занятие» → «Сформировать отчёт»), таких данных нет.
 * Этот модуль собирает те же контрактные структуры (Report[] + GroupReport) из попыток занятия
 * (CardEvent: тайминги, статусы, вызовы, enteredText, Evaluation) и сценариев.
 *
 * Доменная логика не дублируется: оценку попытки считает entities/report (getAttemptEvaluation →
 * generateEvaluation, грамматика — shared/lib/grammar-check) через AiGateway, нормативы — entities/session
 * (resolveTimeNorms). shared/api/mock не импортирует entities, поэтому обе функции приходят зависимостями
 * из серверной сборки app/api/mock/_server (как оценщик попытки в reports.ts).
 *
 * Идемпотентность: отчёт занятия формируется один раз (маркер — групповой свод в store) и дальше только
 * читается; правки преподавателя живут отдельно — teacherOverride в Evaluation попытки (балл пересчитывает
 * reports-score.ts при отдаче) и обратная связь в store-reports.
 */
import type {
  CardEvent,
  ErrorSeverity,
  Evaluation,
  GrammarErrorType,
  GroupReport,
  Report,
  ReportError,
  ReportExportFormat,
  ReportGrammarError,
  ReportStageAttempt,
  ReportTimeMetric,
  Session,
  SessionState,
} from "../types";
import { readReports } from "./readers";
import { findStoredUser } from "./store-admin";
import { findStoredGroupReport, insertStoredSessionReport } from "./store-reports";
import { findStoredSession, listStoredSessions, updateStoredAttempt } from "./store-training";
import { nowIso } from "./time";

/** Нормативы попытки в мс — структурная копия TimeNormsMs из entities/session (shared не импортирует entities). */
export type RuntimeTimeNorms = { primaryReactionMs: number; fullProcessingMs: number };

export type RuntimeReportDeps = {
  /** Оценка попытки: готовая из занятия либо мок-оценка по эталону (AiGateway → entities/report). */
  evaluateAttempt: (attemptId: string) => Promise<Evaluation | null>;
  /** Нормативы попытки: сценарий занятия → дефолты заказчика 30 / 180 сек (entities/session). */
  resolveAttemptNorms: (session: Session, attempt: CardEvent) => RuntimeTimeNorms;
  /** Инсайты группы (AiGateway); пустой список — инсайты считаются здесь по данным занятия. */
  groupInsights: (sessionId: string) => Promise<string[]>;
};

/** Отчёт формируется по завершённому занятию: до «Завершить занятие» отчётных данных нет. */
const REPORTABLE_STATES: readonly SessionState[] = ["finished", "reported"];

const STAGE_REACTION = "Первичная реакция";
const STAGE_PROCESSING = "Полная отработка";
const STAGES = [STAGE_REACTION, STAGE_PROCESSING];

const EXPORT_FORMATS: ReportExportFormat[] = ["csv", "pdf"];

/** Нормативы по умолчанию для шапки графика, если у занятия нет ни одной попытки (ТЗ §7: 30 с / 3 мин). */
const DEFAULT_NORMS: RuntimeTimeNorms = { primaryReactionMs: 30_000, fullProcessingMs: 180_000 };

const MS_IN_SECOND = 1000;

/** Курсант не завершил ни одной карточки: отчёт есть, но данных для оценки нет (не пустой и не битый). */
export const NO_ATTEMPTS_COMMENT =
  "Нет данных по попыткам: курсант не завершил ни одной карточки занятия. " +
  "Оценка не формировалась — назначьте повторное занятие.";

export const NO_ATTEMPTS_INSIGHT =
  "Нет данных по попыткам: за занятие не завершена ни одна карточка — сводные показатели не рассчитаны.";

/** Критерии группового свода (оси Evaluation) — те же подписи, что в mocks/reports.json. */
const CRITERIA = ["Время", "Корректность", "Грамматика", "Смысл"];
const CRITERION_TIME = 0;
const CRITERION_CORRECTNESS = 1;
const CRITERION_GRAMMAR = 2;

type ScoredAttempt = {
  attempt: CardEvent;
  evaluation: Evaluation;
  norms: RuntimeTimeNorms;
  /** Балл попытки с приоритетом преподавателя (Q&A в3). */
  score: number;
};

type BuiltReport = { report: Report; attempts: ScoredAttempt[] };

/** "ses-2026-09-16-01" → "2026-09-16-01": отчёты мока именуются rep-<хвост занятия>-<курсант>. */
function sessionSuffix(sessionId: string): string {
  return sessionId.replace(/^ses-/, "");
}

export function runtimeReportId(sessionId: string, studentId: string): string {
  return `rep-${sessionSuffix(sessionId)}-${studentId}`;
}

export function runtimeGroupReportId(sessionId: string): string {
  return `rep-${sessionSuffix(sessionId)}-group`;
}

/** Занятие мока со статикой в reports.json: рантайм-отчёт не формируется, отдаётся статический. */
export function hasStaticReports(sessionId: string): boolean {
  return readReports().some((report) => report.sessionId === sessionId);
}

function toSec(valueMs: number): number {
  return Math.round(valueMs / MS_IN_SECOND);
}

/* ─── Попытки занятия ───────────────────────────────────────────────────────────────────────────── */

/** В отчёт идут только завершённые попытки: у незавершённой completedAt = "" и fullProcessingMs = 0. */
function isCompleted(attempt: CardEvent): boolean {
  return attempt.completedAt !== "" && attempt.fullProcessingMs > 0;
}

/**
 * Оценка попытки фиксируется в занятии при формировании отчёта: дальше её читают GET /attempts/[id]/evaluation,
 * лента занятия и пересчёт балла после правки преподавателя — из одного источника.
 */
async function scoreAttempt(
  session: Session,
  attempt: CardEvent,
  deps: RuntimeReportDeps,
): Promise<ScoredAttempt | null> {
  const evaluation = attempt.evaluation ?? (await deps.evaluateAttempt(attempt.id));
  if (!evaluation) return null;
  if (!attempt.evaluation) {
    updateStoredAttempt(attempt.id, (draft) => {
      draft.evaluation = evaluation;
    });
  }
  return {
    attempt,
    evaluation,
    norms: deps.resolveAttemptNorms(session, attempt),
    score: evaluation.teacherOverride?.score ?? evaluation.totalScore,
  };
}

async function scoreStudentAttempts(
  session: Session,
  studentId: string,
  deps: RuntimeReportDeps,
): Promise<ScoredAttempt[]> {
  const attempts = session.cardEvents.filter(
    (attempt) => attempt.studentId === studentId && isCompleted(attempt),
  );
  const scored = await Promise.all(attempts.map((attempt) => scoreAttempt(session, attempt, deps)));
  return scored.filter((item): item is ScoredAttempt => item !== null);
}

/* ─── Отчёт курсанта ────────────────────────────────────────────────────────────────────────────── */

function toTimeMetrics(scored: readonly ScoredAttempt[]): ReportTimeMetric[] {
  return scored.flatMap(({ attempt, norms }) => [
    {
      cardId: attempt.cardId,
      stage: STAGE_REACTION,
      normMs: norms.primaryReactionMs,
      factMs: attempt.primaryReactionMs,
      deviationMs: attempt.primaryReactionMs - norms.primaryReactionMs,
    },
    {
      cardId: attempt.cardId,
      stage: STAGE_PROCESSING,
      normMs: norms.fullProcessingMs,
      factMs: attempt.fullProcessingMs,
      deviationMs: attempt.fullProcessingMs - norms.fullProcessingMs,
    },
  ]);
}

function toGrammarErrors(scored: readonly ScoredAttempt[]): ReportGrammarError[] {
  return scored.flatMap(({ attempt, evaluation }) =>
    evaluation.grammarErrors.map((error) => ({ cardId: attempt.cardId, ...error })),
  );
}

function toErrors(scored: readonly ScoredAttempt[]): ReportError[] {
  return scored.flatMap(({ attempt, evaluation }) =>
    evaluation.errors.map((error) => ({ cardId: attempt.cardId, ...error })),
  );
}

function countBy<TKey extends string>(keys: readonly TKey[], values: readonly TKey[]): Record<TKey, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<TKey, number>;
  for (const value of values) if (value in counts) counts[value] += 1;
  return counts;
}

const GRAMMAR_TYPES: GrammarErrorType[] = ["spelling", "syntax"];
const SEVERITIES: ErrorSeverity[] = ["critical", "major", "minor"];

function toStageAttempts(scored: readonly ScoredAttempt[]): ReportStageAttempt[] {
  return scored.map(({ attempt }) => ({
    attemptId: attempt.id,
    cardId: attempt.cardId,
    factMs: [attempt.primaryReactionMs, attempt.fullProcessingMs],
  }));
}

/** Средний балл курсанта по попыткам — то же правило, что в reports-score.ts (98 и 95 → 96). */
function averageScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return Math.floor(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function buildAiComment(scored: readonly ScoredAttempt[], errors: readonly ReportError[]): string {
  if (scored.length === 0) return NO_ATTEMPTS_COMMENT;
  const exceeded = scored.filter(
    ({ attempt, norms }) =>
      attempt.primaryReactionMs > norms.primaryReactionMs ||
      attempt.fullProcessingMs > norms.fullProcessingMs,
  ).length;
  const timing =
    exceeded === 0
      ? "Нормативы времени соблюдены."
      : `Нормативы времени превышены в ${exceeded} из ${scored.length} попыток.`;
  const critical = errors.filter((error) => error.severity === "critical").length;
  const remarks =
    errors.length === 0
      ? "Замечаний по эталону нет."
      : `Замечаний: ${errors.length}, из них критичных ${critical}.`;
  return `ИИ-разбор (мок): отработано карточек — ${scored.length}. ${timing} ${remarks}`;
}

function buildStudentReport(
  session: Session,
  studentId: string,
  scored: readonly ScoredAttempt[],
  generatedAt: string,
): Report {
  const student = findStoredUser(studentId);
  const errors = toErrors(scored);
  const grammarErrors = toGrammarErrors(scored);
  const norms = scored[0]?.norms ?? DEFAULT_NORMS;
  return {
    id: runtimeReportId(session.id, studentId),
    sessionId: session.id,
    generatedAt,
    exportFormats: [...EXPORT_FORMATS],
    student: {
      studentId,
      fullName: student?.fullName ?? studentId,
      armNumber: student?.armNumber ?? 0,
    },
    timeMetrics: toTimeMetrics(scored),
    grammarErrors,
    errors,
    score: averageScore(scored.map((item) => item.score)),
    charts: {
      byStage: {
        stages: [...STAGES],
        normMs: [norms.primaryReactionMs, norms.fullProcessingMs],
        attempts: toStageAttempts(scored),
      },
      byErrorType: {
        grammar: countBy(
          GRAMMAR_TYPES,
          grammarErrors.map((error) => error.type),
        ),
        errors: countBy(
          SEVERITIES,
          errors.map((error) => error.severity),
        ),
      },
      dynamics: {
        labels: scored.map((item) => item.attempt.id),
        scores: scored.map((item) => item.score),
      },
    },
    aiComment: buildAiComment(scored, errors),
  };
}

/* ─── Групповой свод ────────────────────────────────────────────────────────────────────────────── */

/** Фамилия из ФИО для подписей графика (в mocks/reports.json подписи тоже по фамилии). */
function toLastName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

/**
 * Ошибки по критериям оценки: тип ошибки → ось Evaluation (time* → Время, grammar* → Грамматика,
 * остальные — соответствие эталону). Смысловых типов ошибок мок-оценка не порождает — ось остаётся нулевой.
 */
function countErrorsByCriterion(built: readonly BuiltReport[]): number[] {
  const counts = CRITERIA.map(() => 0);
  for (const { report } of built) {
    for (const error of report.errors) {
      if (error.type.startsWith("time")) counts[CRITERION_TIME] += 1;
      else if (error.type.startsWith("grammar")) counts[CRITERION_GRAMMAR] += 1;
      else counts[CRITERION_CORRECTNESS] += 1;
    }
    counts[CRITERION_GRAMMAR] += report.grammarErrors.length;
  }
  return counts;
}

function buildGroupInsights(built: readonly BuiltReport[], norms: RuntimeTimeNorms): string[] {
  const withAttempts = built.filter((item) => item.attempts.length > 0);
  if (withAttempts.length === 0) return [NO_ATTEMPTS_INSIGHT];
  const reactionNormSec = toSec(norms.primaryReactionMs);
  const slow = withAttempts.filter((item) =>
    item.attempts.some(({ attempt, norms: own }) => attempt.primaryReactionMs > own.primaryReactionMs),
  ).length;
  const grammar = withAttempts.reduce((sum, item) => sum + item.report.grammarErrors.length, 0);
  const critical = withAttempts.reduce(
    (sum, item) => sum + item.report.errors.filter((error) => error.severity === "critical").length,
    0,
  );
  const average = averageScore(withAttempts.map((item) => item.report.score));
  return [
    `Инсайты ИИ (мок). Отчёт по ${withAttempts.length} из ${built.length} курсантов, средний балл группы ${average}.`,
    slow === 0
      ? `Норматив первичной реакции (${reactionNormSec} с) соблюдён всеми курсантами занятия.`
      : `${slow} из ${withAttempts.length} курсантов превысили норматив первичной реакции (${reactionNormSec} с) — повторить регламент первичной обработки.`,
    grammar === 0
      ? "Грамматических ошибок в ручном вводе не зафиксировано."
      : `Грамматических ошибок в ручном вводе: ${grammar} — риск искажения смысла при реальной работе.`,
    critical === 0
      ? "Критичных отклонений от эталона нет."
      : `Критичных отклонений от эталона: ${critical} — разобрать регламентные звонки точке C перед следующим занятием.`,
  ];
}

async function buildGroupReport(
  session: Session,
  built: readonly BuiltReport[],
  generatedAt: string,
  deps: RuntimeReportDeps,
): Promise<GroupReport> {
  const withAttempts = built.filter((item) => item.attempts.length > 0);
  const norms = withAttempts[0]?.attempts[0]?.norms ?? DEFAULT_NORMS;
  const attempts = withAttempts.flatMap((item) => item.attempts);
  const fromGateway = await deps.groupInsights(session.id);
  return {
    id: runtimeGroupReportId(session.id),
    sessionId: session.id,
    generatedAt,
    reportIds: built.map((item) => item.report.id),
    groupInsights: fromGateway.length > 0 ? fromGateway : buildGroupInsights(built, norms),
    charts: {
      scoreByStudent: {
        kind: "bar",
        title: "Интегральный балл по курсантам",
        series: {
          labels: withAttempts.map((item) => toLastName(item.report.student.fullName)),
          values: withAttempts.map((item) => item.report.score),
        },
      },
      reactionByAttempt: {
        kind: "line",
        title: `Время реакции по попыткам (норматив ${toSec(norms.primaryReactionMs)} с)`,
        series: {
          labels: attempts.map((item) => item.attempt.id),
          values: attempts.map((item) => toSec(item.attempt.primaryReactionMs)),
          norm: toSec(norms.primaryReactionMs),
        },
      },
      errorsByCriterion: {
        kind: "heatmap",
        title: "Ошибки по критериям оценки",
        series: { criteria: [...CRITERIA], errors: countErrorsByCriterion(built) },
      },
    },
  };
}

/* ─── Формирование и чтение ─────────────────────────────────────────────────────────────────────── */

/**
 * Формирует отчёт занятия, если он ещё не формировался. Ничего не делает для занятия мока со статикой,
 * для незавершённого занятия и для уже сформированного отчёта (повторный вызов не создаёт дублей).
 * Вызывается при переходе в `reported` (POST /sessions/[id]/control) и лениво при чтении отчётов.
 */
export async function ensureSessionReport(sessionId: string, deps: RuntimeReportDeps): Promise<void> {
  const session = findStoredSession(sessionId);
  if (!session || !REPORTABLE_STATES.includes(session.state)) return;
  if (hasStaticReports(sessionId) || findStoredGroupReport(sessionId)) return;
  const generatedAt = nowIso();
  const built: BuiltReport[] = [];
  for (const studentId of session.studentIds) {
    const attempts = await scoreStudentAttempts(session, studentId, deps);
    built.push({ report: buildStudentReport(session, studentId, attempts, generatedAt), attempts });
  }
  const groupReport = await buildGroupReport(session, built, generatedAt, deps);
  insertStoredSessionReport(
    built.map((item) => item.report),
    groupReport,
  );
}

/** Ленивое формирование для выборки по курсанту (`GET /reports?studentId=`) — по всем его занятиям. */
export async function ensureStudentReports(studentId: string, deps: RuntimeReportDeps): Promise<void> {
  const sessions = listStoredSessions().filter((session) => session.studentIds.includes(studentId));
  for (const session of sessions) await ensureSessionReport(session.id, deps);
}
