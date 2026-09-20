/*
 * Сборка PhoneCall из состояния вызова (T2.4-05) и строк журнала из попыток курсанта.
 * Метки времени — из абстракции часов (Clock.now), в формате мок-слоя ISO 8601 с +03:00.
 */
import type { CardCallRequest, InternalNumber, PhoneCall, SessionContract } from "@/shared/api";

import type { CallLogEntry, FinishedCall, TranscriptLine } from "../model/types";

const MOSCOW_OFFSET = "+03:00";
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const ISO_DATE_TIME_LENGTH = 19;
const UNKNOWN_SUBSCRIBER = "Абонент не найден";

/** epoch ms → «2026-09-17T11:20:00+03:00». */
export function toMoscowIso(epochMs: number): string {
  const shifted = new Date(epochMs + MOSCOW_OFFSET_MS);
  return `${shifted.toISOString().slice(0, ISO_DATE_TIME_LENGTH)}${MOSCOW_OFFSET}`;
}

/** Завершённый вызов с замороженным транскриптом. */
export function finishCall(
  target: { number: string; subscriberTitle: string },
  startedAtMs: number,
  endedAtMs: number,
  lines: readonly TranscriptLine[],
): FinishedCall {
  const transcript = Object.freeze(lines.map((line) => Object.freeze({ ...line })));
  return Object.freeze({
    number: target.number,
    subscriberTitle: target.subscriberTitle,
    startedAt: toMoscowIso(startedAtMs),
    endedAt: toMoscowIso(endedAtMs),
    transcript,
  });
}

/** Тело POST /cards/[id]/calls: PhoneCall (fromUserId, toNumber, startedAt/endedAt, transcript). */
export function buildCardCallRequest(call: FinishedCall, studentId: string): CardCallRequest {
  return {
    studentId,
    toNumber: call.number,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    transcript: call.transcript.map((line) => ({ ...line })),
  };
}

export function findSubscriberTitle(numbers: readonly InternalNumber[], number: string): string {
  return numbers.find((entry) => entry.number === number)?.title ?? UNKNOWN_SUBSCRIBER;
}

function toLogEntry(call: PhoneCall, cardId: string, id: string, numbers: readonly InternalNumber[]) {
  return {
    id: call.id ?? id,
    number: call.toNumber,
    subscriberTitle: findSubscriberTitle(numbers, call.toNumber),
    startedAt: call.startedAt,
    endedAt: call.endedAt ?? call.startedAt,
    cardId,
    isSaved: true,
  } satisfies CallLogEntry;
}

/** Журнал: все PhoneCall попыток курсанта, новые сверху. */
export function collectCallLog(
  sessions: readonly SessionContract[],
  studentId: string,
  numbers: readonly InternalNumber[],
): CallLogEntry[] {
  return sessions
    .flatMap((session) => session.cardEvents)
    .filter((attempt) => attempt.studentId === studentId)
    .flatMap((attempt) =>
      attempt.calls.map((call, index) => toLogEntry(call, attempt.cardId, `${attempt.id}-${index}`, numbers)),
    )
    .sort(compareByStartDesc);
}

export function compareByStartDesc(left: CallLogEntry, right: CallLogEntry): number {
  return Date.parse(right.startedAt) - Date.parse(left.startedAt);
}

/** Длительность вызова, мс. */
export function getCallDurationMs(entry: { startedAt: string; endedAt: string }): number {
  return Math.max(0, Date.parse(entry.endedAt) - Date.parse(entry.startedAt));
}
