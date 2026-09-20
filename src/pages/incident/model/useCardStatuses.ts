"use client";

import { useCallback, useState } from "react";

import { createStatusFormMachine } from "@/features/status-form";
import type { StatusFormValues } from "@/features/status-form";
import type {
  CardEventContract,
  CardStatusMark,
  CardStatusRequest,
  DdsStatus,
  DdsStatusDef,
} from "@/shared/api";
import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import type { OutboxItem } from "../lib/outbox";
import { toMoscowIso } from "../lib/time";
import type { OutboxResult } from "./outboxSender";

type UseCardStatusesOptions = {
  cardId: string;
  attempt: CardEventContract;
  /** Последний статус ДДС карточки в мок-слое (граф проверяет сервер по нему). */
  serverStatus: DdsStatus | null;
  ddsStatuses: DdsStatusDef[];
  dispatch: (item: OutboxItem) => Promise<OutboxResult | null>;
  clock?: Clock;
};

function toRequest(values: StatusFormValues): CardStatusRequest {
  const request: CardStatusRequest = { ddsStatus: values.status as DdsStatus };
  if (values.comment.trim()) request.comment = values.comment.trim();
  if (values.dutyNumber.trim()) request.dutyNumber = values.dutyNumber.trim();
  return request;
}

/**
 * Статусы ДДС попытки (T2.3-12): проверка по графу reference.ddsStatuses, POST /cards/[id]/status + запись
 * в CardEvent.statuses; при сбое связи — оптимистично и в буфер. «Работы завершены» / «Отказ…» завершают
 * попытку (completedAt) и закрывают карточку для редактирования.
 */
export function useCardStatuses(options: UseCardStatusesOptions) {
  const { cardId, attempt, ddsStatuses, dispatch, clock = systemClock } = options;
  const [marks, setMarks] = useState<CardStatusMark[]>(attempt.statuses);
  const [current, setCurrent] = useState<DdsStatus | null>(options.serverStatus);
  const [completedAt, setCompletedAt] = useState<string | null>(attempt.completedAt || null);

  const submit = useCallback(
    async (values: StatusFormValues) => {
      const machine = createStatusFormMachine(ddsStatuses);
      const request = toRequest(values);
      machine.assertTransition(current, request.ddsStatus, { comment: request.comment });
      const at = toMoscowIso(clock.now());
      const item: OutboxItem = {
        id: `status-${at}`,
        kind: "status",
        cardId,
        attemptId: attempt.id,
        request,
        at,
      };
      await dispatch(item);
      setMarks((previous) => [...previous, { ...request, at }]);
      setCurrent(request.ddsStatus);
      if (!machine.isFinal(request.ddsStatus)) return;
      setCompletedAt(at);
      await dispatch({
        id: `complete-${at}`,
        kind: "progress",
        attemptId: attempt.id,
        request: { completedAt: at },
      });
    },
    [attempt.id, cardId, clock, current, ddsStatuses, dispatch],
  );

  return { marks, currentStatus: current, completedAt, isCompleted: completedAt !== null, submit };
}
