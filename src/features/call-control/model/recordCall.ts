/*
 * Запись завершённого вызова (T2.4-05): при вызове из карточки — POST /cards/[id]/calls в CardEvent.calls
 * текущей попытки; без карточки или без открытой попытки — только локальный журнал (isSaved: false).
 */
import { ApiError, postCardCall } from "@/shared/api";

import { buildCardCallRequest } from "../lib/phoneCall";
import type { CallLogEntry, FinishedCall } from "./types";

export type CallRecordContext = {
  cardId: string | null;
  studentId: string | null;
};

export type CallRecordResult = {
  entry: CallLogEntry;
  /** Сообщение, если вызов не попал в попытку. */
  warning: string | null;
};

const NOT_SAVED_WARNING = "Вызов не записан в попытку";
let localSequence = 0;

function toEntry(call: FinishedCall, cardId: string | null, id: string, isSaved: boolean): CallLogEntry {
  const { number, subscriberTitle, startedAt, endedAt } = call;
  return { id, number, subscriberTitle, startedAt, endedAt, cardId, isSaved };
}

export async function recordFinishedCall(
  call: FinishedCall,
  { cardId, studentId }: CallRecordContext,
): Promise<CallRecordResult> {
  localSequence += 1;
  const localId = `local-call-${localSequence}`;
  if (!cardId || !studentId) return { entry: toEntry(call, cardId, localId, false), warning: null };
  try {
    const saved = await postCardCall(cardId, buildCardCallRequest(call, studentId));
    return { entry: toEntry(call, cardId, saved.call.id ?? localId, true), warning: null };
  } catch (error) {
    const reason = error instanceof ApiError ? error.message : NOT_SAVED_WARNING;
    return { entry: toEntry(call, cardId, localId, false), warning: `${NOT_SAVED_WARNING}: ${reason}` };
  }
}
