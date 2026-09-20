/* Общие данные модели мониторинга: занятие, курсанты, подписи карточек, справочник статусов, свёртка ленты. */
import type { TimeNormsMs } from "@/entities/session";
import { formatShortName } from "@/entities/user";
import type { DdsStatusDef, SessionContract } from "@/shared/api";

import type { CardCaptionMap, MonitorStudent } from "../model/types";
import type { StudentLive } from "./liveState";

export type MonitorSource = {
  session: SessionContract;
  /** Курсанты занятия (публичные поля) — из серверного компонента страницы. */
  students: MonitorStudent[];
  captions: CardCaptionMap;
  ddsStatuses: DdsStatusDef[];
  /** Свёртка ленты по курсантам (reduceLiveStates). */
  live: Record<string, StudentLive>;
  /** «Сейчас» клиента, мс — общий для всех таймеров одного кадра. */
  nowMs: number;
  norms: TimeNormsMs;
};

const EMPTY_CAPTION = { number: "—", type: "—" };

export function getCaption(captions: CardCaptionMap, cardId: string | null) {
  if (!cardId) return EMPTY_CAPTION;
  return captions[cardId] ?? { number: cardId, type: "—" };
}

export function findStudent(students: MonitorStudent[], studentId: string): MonitorStudent | undefined {
  return students.find((student) => student.id === studentId);
}

export function getStudentName(students: MonitorStudent[], studentId: string): string {
  const student = findStudent(students, studentId);
  return student ? formatShortName(student.fullName) : studentId;
}

export function getFullName(students: MonitorStudent[], studentId: string): string {
  return findStudent(students, studentId)?.fullName ?? studentId;
}

export function getStatusTitle(ddsStatuses: DdsStatusDef[], status: string | null): string {
  if (!status) return "—";
  return ddsStatuses.find((ref) => ref.status === status)?.title ?? status;
}
