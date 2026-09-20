/* Шапка занятия (T3.3-03): ID/название, состояние, старт и живое время от него. */
import { getModeTitle, getSessionStateTitle, parseIsoMs } from "@/entities/session";
import { formatElapsed } from "@/widgets/monitor-grid";
import type { SessionHeaderModel } from "@/widgets/monitor-grid";
import type { SessionContract } from "@/shared/api";
import { formatDate, formatDateTime } from "@/shared/lib";

const FINISHED_STATES = ["finished", "reported"];

export function buildHeader(
  session: SessionContract,
  teacherName: string,
  nowMs: number,
): SessionHeaderModel {
  return {
    sessionId: session.id,
    title: `Занятие ${formatDate(session.startedAt)}`,
    stateTitle: getSessionStateTitle(session.state),
    startedAt: formatDateTime(session.startedAt),
    elapsed: formatElapsed(nowMs - parseIsoMs(session.startedAt)),
    modeTitle: getModeTitle(session.mode),
    teacherName,
    studentCount: session.studentIds.length,
    isFinished: FINISHED_STATES.includes(session.state),
  };
}
