/*
 * Последовательность действий курсанта по попытке (T3.3-08) в терминах эталона Etalon.expectedActions:
 * «openCard:<cardId>» — открытие карточки, «status:<ddsStatus>» — отметка статуса ДДС,
 * «call:<номер>» — вызов точки C (CardEvent.calls). Порядок — по времени.
 */
import { parseIsoMs } from "@/entities/session";
import type { CardEventContract } from "@/shared/api";

import type { SnapshotAction } from "../model/types";

export function buildAttemptActions(attempt: CardEventContract): SnapshotAction[] {
  const actions: SnapshotAction[] = [
    { action: `openCard:${attempt.cardId}`, at: attempt.openedAt },
    ...attempt.statuses.map((mark) => ({ action: `status:${mark.ddsStatus}`, at: mark.at })),
    ...attempt.calls.map((call) => ({ action: `call:${call.toNumber}`, at: call.startedAt })),
  ];
  return actions.sort((left, right) => parseIsoMs(left.at) - parseIsoMs(right.at));
}
