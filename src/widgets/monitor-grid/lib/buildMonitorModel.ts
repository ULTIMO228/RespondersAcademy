/*
 * Плитки курсантов и очередь выдачи (T3.3-04, T3.3-06). Источник — занятие (cardFlow) и свёртка ленты;
 * второго источника истины нет. Формат таймеров — «м:сс» (spec/07-design-guidelines.md).
 */
import { formatDuration, formatHourMinute } from "@/shared/lib";

import type { QueueItem, StudentTileModel } from "../model/types";
import { buildStudentState } from "./studentState";
import { sumErrors } from "./liveState";
import type { StudentLive } from "./liveState";
import { getCaption, getStatusTitle, getStudentName } from "./monitorSource";
import type { MonitorSource } from "./monitorSource";

const EMPTY_LIVE: StudentLive = { studentId: "", issued: [], attempts: [], lastEventAt: null };

function buildTile(studentId: string, source: MonitorSource): StudentTileModel {
  const live = source.live[studentId] ?? { ...EMPTY_LIVE, studentId };
  const state = buildStudentState(live, source.nowMs, source.norms);
  const caption = getCaption(source.captions, state.cardId);
  const errors = sumErrors(live);
  return {
    studentId,
    shortName: getStudentName(source.students, studentId),
    armNumber: source.students.find((student) => student.id === studentId)?.armNumber ?? 0,
    cardNumber: caption.number,
    cardType: caption.type,
    state: state.state,
    reaction: formatDuration(state.reactionMs),
    isReactionExceeded: state.isReactionExceeded,
    processing: formatDuration(state.processingMs),
    isProcessingExceeded: state.isProcessingExceeded,
    statusTitle: getStatusTitle(source.ddsStatuses, state.ddsStatus),
    errorCount: errors.errorCount,
    isAiEvaluated: errors.isAiEvaluated,
  };
}

/** Плитки — по одной на каждого курсанта занятия (все видны одновременно, spec/04-pages/10). */
export function buildStudentTiles(source: MonitorSource): StudentTileModel[] {
  return source.session.studentIds.map((studentId) => buildTile(studentId, source));
}

/** Очередь выдачи по Session.cardFlow: выдано (issuedAt ≤ «сейчас») / ожидает. */
export function buildQueueItems(source: MonitorSource): QueueItem[] {
  return source.session.cardFlow.map((flowItem, index) => {
    const caption = getCaption(source.captions, flowItem.cardId);
    return {
      id: `${flowItem.cardId}-${flowItem.studentId}-${index}`,
      time: formatHourMinute(flowItem.issuedAt),
      cardNumber: caption.number,
      cardType: caption.type,
      studentName: getStudentName(source.students, flowItem.studentId),
      level: flowItem.level,
      isIssued: Date.parse(flowItem.issuedAt) <= source.nowMs,
    };
  });
}
