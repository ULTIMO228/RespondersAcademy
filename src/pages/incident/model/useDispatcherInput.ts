"use client";

import { useCallback, useMemo } from "react";

import type { DispatcherControl } from "@/widgets/incident-card";
import { draftStorageKey, useStatementDraft } from "@/features/statement-form";
import type { DraftFields, DraftSaveState } from "@/features/statement-form";
import type { KeyValueStorage } from "@/shared/lib";

import type { OutboxItem } from "../lib/outbox";
import { DISPATCHER_TEXT_FIELD, DUTY_NUMBER_FIELD } from "./constants";
import type { OutboxResult } from "./outboxSender";

type UseDispatcherInputOptions = {
  cardId: string;
  studentId: string;
  attemptId: string;
  enteredText: Record<string, string>;
  storage: KeyValueStorage;
  isOnline: boolean;
  pendingCount: number;
  dispatch: (item: OutboxItem) => Promise<OutboxResult | null>;
  callHref: string;
};

const SAVE_STATUS: Record<DraftSaveState, string | undefined> = {
  idle: undefined,
  pending: "Сохраняется…",
  saved: "Черновик сохранён",
};
const OFFLINE_STATUS = "Сохранено локально — будет отправлено после восстановления связи";

/**
 * «Действие диспетчера» (T2.3-09): черновик в буфере localStorage (ключ — курсант + карточка) с восстановлением;
 * после паузы ввода текст уходит в CardEvent.enteredText (при сбое связи — через буфер досылки).
 */
export function useDispatcherInput(options: UseDispatcherInputOptions): DispatcherControl {
  const { cardId, studentId, attemptId, enteredText, storage, isOnline, pendingCount, dispatch } = options;
  const commit = useCallback(
    (fields: DraftFields) => {
      const request = { enteredText: fields };
      void dispatch({ id: `text-${Date.now()}`, kind: "progress", attemptId, request }).catch(
        () => undefined,
      );
    },
    [attemptId, dispatch],
  );
  const initialFields = useMemo(
    () => ({
      [DISPATCHER_TEXT_FIELD]: enteredText[DISPATCHER_TEXT_FIELD] ?? "",
      [DUTY_NUMBER_FIELD]: enteredText[DUTY_NUMBER_FIELD] ?? "",
    }),
    [enteredText],
  );
  const { fields, setField, saveState } = useStatementDraft({
    storage,
    storageKey: draftStorageKey(cardId, studentId),
    initialFields,
    onCommit: commit,
  });
  const isBuffered = !isOnline || pendingCount > 0;
  return {
    text: fields[DISPATCHER_TEXT_FIELD] ?? "",
    dutyNumber: fields[DUTY_NUMBER_FIELD] ?? "",
    onTextChange: (value) => setField(DISPATCHER_TEXT_FIELD, value),
    onDutyNumberChange: (value) => setField(DUTY_NUMBER_FIELD, value),
    status: isBuffered && saveState !== "idle" ? OFFLINE_STATUS : SAVE_STATUS[saveState],
    callHref: options.callHref,
  };
}
