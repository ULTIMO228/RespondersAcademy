/*
 * Детализация попыток занятия (spec/04-pages/13 п. 3): тайминги этапов с отклонениями, ошибки построчно,
 * вызовы с транскриптом, расшифровка балла по критериям и итог с приоритетом преподавателя (Q&A в3).
 */
import { computeTotalScore, SCORE_AXES } from "@/entities/report";
import type { ScoreWeights } from "@/entities/report";
import type { DdsStatusDef, ReportContract } from "@/shared/api";

import type { CardCaption, EvaluatedAttempt } from "../api/loadSessionReport";
import type { AttemptView } from "../model/types";
import { buildCalls } from "./buildCalls";
import { buildIssues } from "./buildIssues";
import { buildStages } from "./buildStages";

export type AttemptSource = {
  reports: ReportContract[];
  captions: Record<string, CardCaption>;
  ddsStatuses: DdsStatusDef[];
  weights: Readonly<ScoreWeights>;
};

const UNKNOWN_CAPTION: CardCaption = { number: "—", type: "—" };

function getStudentName(studentId: string, reports: ReportContract[]): string {
  return reports.find((report) => report.student.studentId === studentId)?.student.fullName ?? studentId;
}

export function buildAttempts(attempts: EvaluatedAttempt[], source: AttemptSource): AttemptView[] {
  return attempts.map((attempt) => {
    const { evaluation } = attempt;
    const caption = source.captions[attempt.cardId] ?? UNKNOWN_CAPTION;
    const scores = SCORE_AXES.map((axis) => ({
      key: axis.key,
      title: axis.title,
      value: evaluation[axis.key],
      weightPercent: source.weights[axis.key],
    }));
    const weightedTotal = computeTotalScore(evaluation, source.weights);
    return {
      id: attempt.id,
      studentId: attempt.studentId,
      studentName: getStudentName(attempt.studentId, source.reports),
      cardNumber: caption.number,
      cardType: caption.type,
      stages: buildStages(attempt, source.ddsStatuses),
      issues: buildIssues(evaluation),
      calls: buildCalls(attempt),
      scores,
      aiTotal: evaluation.totalScore,
      weightedTotal,
      finalTotal: evaluation.teacherOverride?.score ?? weightedTotal,
      aiComment: evaluation.aiComment,
      teacherOverride: evaluation.teacherOverride,
    };
  });
}
