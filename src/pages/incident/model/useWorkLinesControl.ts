"use client";

import { useState } from "react";

import { composeCalledTo } from "@/widgets/incident-card";
import type { WorkLineData, WorkLineFormValues, WorkLinesControl } from "@/widgets/incident-card";
import type { CardWorkLine, CardWorkLineRequest, InternalNumber } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import type { OutboxItem } from "../lib/outbox";
import type { OutboxResult } from "./outboxSender";

type UseWorkLinesControlOptions = {
  cardId: string;
  initial: WorkLineData[];
  canAdd: boolean;
  operator: string;
  serviceNames: string[];
  internalNumbers: InternalNumber[];
  dispatch: (item: OutboxItem) => Promise<OutboxResult | null>;
  now: () => string;
};

const SERVICE_NUMBER = /\b(\d{3})\b/;

/** Автоподстановка телефона: учебный внутренний номер службы 101–104 (reference.internalNumbers). */
export function buildPhoneBook(serviceNames: string[], internalNumbers: InternalNumber[]) {
  return serviceNames.flatMap((service) => {
    const number = SERVICE_NUMBER.exec(service)?.[1];
    return number && internalNumbers.some((entry) => entry.number === number)
      ? [{ service, phone: number }]
      : [];
  });
}

function isWorkLine(result: OutboxResult | null): result is CardWorkLine {
  return result !== null && "calledTo" in result;
}

/** Отработки тренажёра (T2.3-16): POST /cards/[id]/worklines (при сбое связи — буфер), строки — в таблицу. */
export function useWorkLinesControl(options: UseWorkLinesControlOptions): WorkLinesControl {
  const { cardId, canAdd, operator, serviceNames, internalNumbers, dispatch, now } = options;
  const [extra, setExtra] = useState<WorkLineData[]>(options.initial);

  async function onAdd(values: WorkLineFormValues) {
    const request: CardWorkLineRequest = {
      service: values.service,
      calledTo: composeCalledTo(values.calledTo, values.phone),
      person: values.person.trim(),
      message: values.message.trim(),
      operator,
      confirmed: values.confirmed,
    };
    const result = await dispatch({ id: `workline-${now()}`, kind: "workline", cardId, request });
    const line = isWorkLine(result) ? result : { ...request, operator, at: now() };
    setExtra((previous) => [...previous, line]);
  }

  return {
    extra,
    canAdd,
    onAdd,
    buildCallHref: () => ROUTES.armPhoneForCard(cardId),
    phoneBook: buildPhoneBook(serviceNames, internalNumbers),
  };
}
