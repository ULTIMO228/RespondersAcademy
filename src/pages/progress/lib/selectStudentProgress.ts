/*
 * Данные мок-API курсанта → представление экрана «Мой прогресс» (сводка, история, «Мои ошибки», рекомендации,
 * графики). Баллы не пересчитываются — только из оценок/отчётов мока; нормативы — Scenario.timeNorms.
 */
import { buildAttemptView, getAttemptScore, groupMistakes, summarizeProgress } from "@/entities/report";
import type { AttemptView, MistakeGroup, ProgressNorms, ProgressSummaryData } from "@/entities/report";
import { resolveTimeNorms } from "@/entities/session";
import type { ReportContract, Scenario } from "@/shared/api";

import type { EvaluatedAttempt, ProgressCardCaption, StudentProgressData } from "../api/progressApi";

/** author — ФИО преподавателя для его обратной связи (T3.4-10); без author текст сформирован ИИ. */
export type Recommendation = { id: string; generatedAt: string; text: string; author?: string };

export type ChartSeries = { labels: string[]; values: number[] };

export type StudentProgress = {
  summary: ProgressSummaryData;
  attempts: AttemptView[];
  pendingCount: number;
  mistakeGroups: MistakeGroup[];
  recommendations: Recommendation[];
  scoreDynamics: ChartSeries;
  errorDistribution: ChartSeries;
};

/** Подписи столбцов «Распределение ошибок» — ключи ReportCharts.byErrorType (reports.json). */
const ERROR_SEVERITY_LABELS = { critical: "Критичные", major: "Существенные", minor: "Незначительные" };
const GRAMMAR_TYPE_LABELS = { spelling: "Орфография", syntax: "Синтаксис" };

/** Обратная связь преподавателя по отчёту (`POST /reports/feedback`) — первой, приоритет преподавателя. */
function buildTeacherFeedback(reports: ReportContract[]): Recommendation[] {
  return reports.flatMap((report) => {
    const feedback = report.teacherFeedback;
    if (!feedback) return [];
    const texts = [feedback.text, ...feedback.recommendations];
    return texts.map((text, index) => ({
      id: `${feedback.reportId}-teacher-${index}`,
      generatedAt: feedback.at,
      text,
      author: feedback.byName,
    }));
  });
}

function buildAiRecommendations(reports: ReportContract[]): Recommendation[] {
  return reports.flatMap((report) =>
    report.aiComment ? [{ id: report.id, generatedAt: report.generatedAt, text: report.aiComment }] : [],
  );
}

function getNorms(cardId: string | undefined, scenarios: Scenario[]): ProgressNorms {
  const scenario = cardId ? scenarios.find((candidate) => candidate.cardIds.includes(cardId)) : undefined;
  const norms = resolveTimeNorms(scenario);
  return { reactionMs: norms.primaryReactionMs, processingMs: norms.fullProcessingMs };
}

function getCaption(captions: Record<string, ProgressCardCaption>, cardId: string): ProgressCardCaption {
  return captions[cardId] ?? { number: cardId, type: "—", href: "" };
}

function toAttemptView(attempt: EvaluatedAttempt, data: StudentProgressData): AttemptView {
  const caption = getCaption(data.captions, attempt.cardId);
  const card = { cardNumber: caption.number, cardType: caption.type, cardHref: caption.href };
  return buildAttemptView(attempt, card, getNorms(attempt.cardId, data.scenarios));
}

/** Динамика балла: ChartData dynamics своих отчётов; подпись точки — № карточки попытки. */
function buildScoreDynamics(reports: ReportContract[], data: StudentProgressData): ChartSeries {
  const cardByAttempt = new Map(data.attempts.map((attempt) => [attempt.id, attempt.cardId]));
  const points = reports.flatMap((report) =>
    report.charts.dynamics.labels.map((label, index) => {
      const cardId = cardByAttempt.get(label);
      return {
        label: cardId ? getCaption(data.captions, cardId).number : label,
        value: report.charts.dynamics.scores[index],
      };
    }),
  );
  return { labels: points.map((point) => point.label), values: points.map((point) => point.value) };
}

/** Распределение ошибок: сумма ChartData byErrorType своих отчётов (тяжесть ошибок + типы грамматики). */
function buildErrorDistribution(reports: ReportContract[]): ChartSeries {
  const severities = Object.keys(ERROR_SEVERITY_LABELS) as (keyof typeof ERROR_SEVERITY_LABELS)[];
  const grammarTypes = Object.keys(GRAMMAR_TYPE_LABELS) as (keyof typeof GRAMMAR_TYPE_LABELS)[];
  const sum = (pick: (report: ReportContract) => number) =>
    reports.reduce((total, report) => total + pick(report), 0);
  return {
    labels: [
      ...severities.map((key) => ERROR_SEVERITY_LABELS[key]),
      ...grammarTypes.map((key) => GRAMMAR_TYPE_LABELS[key]),
    ],
    values: [
      ...severities.map((key) => sum((report) => report.charts.byErrorType.errors[key])),
      ...grammarTypes.map((key) => sum((report) => report.charts.byErrorType.grammar[key])),
    ],
  };
}

function buildSummary(data: StudentProgressData): ProgressSummaryData {
  const metrics = data.attempts.map((attempt) => ({
    openedAt: attempt.openedAt,
    primaryReactionMs: attempt.primaryReactionMs,
    fullProcessingMs: attempt.fullProcessingMs,
    score: getAttemptScore(attempt.evaluation),
    mistakeCount: attempt.evaluation.errors.length + attempt.evaluation.grammarErrors.length,
  }));
  const lastCardId = data.attempts[data.attempts.length - 1]?.cardId;
  return summarizeProgress(
    metrics,
    data.reports.map((report) => report.score),
    getNorms(lastCardId, data.scenarios),
  );
}

function buildMistakeSources(data: StudentProgressData) {
  if (data.studentErrors && data.studentErrors.attempts.length > 0) {
    return data.studentErrors.attempts.map((item) => ({
      attemptId: item.attemptId,
      cardNumber: getCaption(data.captions, item.cardId).number,
      evaluation: {
        errors: item.errors
          .filter((e) => e.category !== "grammar")
          .map((e) => ({
            type: e.ruleId,
            severity: e.severity,
            message: e.message,
          })),
        grammarErrors: item.errors
          .filter((e) => e.category === "grammar")
          .map((e) => ({
            fragment: String(e.observed ?? e.message),
            wrong: String(e.observed ?? e.message),
            expected: String(e.expected ?? ""),
          })),
      },
    }));
  }
  return data.attempts.map((attempt) => ({
    attemptId: attempt.id,
    cardNumber: getCaption(data.captions, attempt.cardId).number,
    evaluation: attempt.evaluation,
  }));
}

/** Только данные курсанта сессии: выборка уже ограничена мок-API и клиентом по studentId (ТЗ §8). */
export function selectStudentProgress(data: StudentProgressData): StudentProgress {
  const reports = [...data.reports].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  return {
    summary: buildSummary(data),
    attempts: data.attempts.map((attempt) => toAttemptView(attempt, data)),
    pendingCount: data.pendingCount,
    mistakeGroups: groupMistakes(buildMistakeSources(data)),
    recommendations: [...buildTeacherFeedback(reports), ...buildAiRecommendations(reports)],
    scoreDynamics: buildScoreDynamics(reports, data),
    errorDistribution: buildErrorDistribution(reports),
  };
}
