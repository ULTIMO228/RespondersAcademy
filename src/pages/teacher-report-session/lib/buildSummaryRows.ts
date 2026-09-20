import { formatDeviationSec, getAverage, msToSec } from "@/entities/session";
import type { ReportContract } from "@/shared/api";

import type { SummaryRow } from "../model/types";

const REACTION_STAGE = "Первичная реакция";
const PROCESSING_STAGE = "Полная отработка";

function getStageAverage(report: ReportContract, stage: string) {
  const metrics = report.timeMetrics.filter((metric) => metric.stage === stage);
  const factSec = getAverage(metrics.map((metric) => msToSec(metric.factMs)));
  const normSec = metrics[0] ? msToSec(metrics[0].normMs) : 0;
  if (factSec === null) return { sec: null, deviation: "—", isExceeded: false };
  return {
    sec: Math.round(factSec),
    deviation: formatDeviationSec(factSec - normSec),
    isExceeded: factSec > normSec,
  };
}

/** Сводная таблица ReportRow: средние по этапам и отклонения от 30/180 сек — из отчётов мок-API. */
export function buildSummaryRows(reports: ReportContract[]): SummaryRow[] {
  return reports.map((report) => {
    const reaction = getStageAverage(report, REACTION_STAGE);
    const processing = getStageAverage(report, PROCESSING_STAGE);
    return {
      id: report.id,
      studentId: report.student.studentId,
      fullName: report.student.fullName,
      armNumber: report.student.armNumber,
      cardCount: new Set(report.timeMetrics.map((metric) => metric.cardId)).size,
      reactionSec: reaction.sec,
      reactionDeviation: reaction.deviation,
      isReactionExceeded: reaction.isExceeded,
      processingSec: processing.sec,
      processingDeviation: processing.deviation,
      isProcessingExceeded: processing.isExceeded,
      grammarCount: report.grammarErrors.length,
      score: report.score,
    };
  });
}
