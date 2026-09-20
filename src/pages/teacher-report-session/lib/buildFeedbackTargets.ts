/*
 * Обратная связь курсанту (spec/04-pages/13 п. 5): по отчёту курсанта — комментарий ИИ как черновик,
 * рекомендации из домена (типы ошибок оценки) и уже отправленная запись из мок-слоя.
 */
import type { ReportContract } from "@/shared/api";

import { RECOMMENDATIONS } from "../config/report";
import type { FeedbackTarget } from "../model/types";

const PROCESSING_STAGE = "Полная отработка";

function buildRecommendations(report: ReportContract): string[] {
  const errorTypes = Array.from(new Set(report.errors.map((error) => error.type)));
  const texts = errorTypes.map((type) => RECOMMENDATIONS[type]).filter(Boolean);
  if (report.grammarErrors.length > 0) texts.push(RECOMMENDATIONS.grammar);
  const hasProcessingOverrun = report.timeMetrics.some(
    (metric) => metric.stage === PROCESSING_STAGE && metric.deviationMs > 0,
  );
  if (hasProcessingOverrun && !errorTypes.includes("timeProcessingExceeded")) {
    texts.push(RECOMMENDATIONS.timeProcessingExceeded);
  }
  return texts.length > 0 ? Array.from(new Set(texts)) : [RECOMMENDATIONS.none];
}

export function buildFeedbackTargets(reports: ReportContract[]): FeedbackTarget[] {
  return reports.map((report) => ({
    reportId: report.id,
    studentId: report.student.studentId,
    fullName: report.student.fullName,
    aiComment: report.aiComment ?? "",
    recommendations: buildRecommendations(report),
    sentText: report.teacherFeedback?.text ?? null,
    sentAt: report.teacherFeedback?.at ?? null,
    sentBy: report.teacherFeedback?.byName ?? null,
  }));
}
