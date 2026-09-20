"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { systemClock } from "@/shared/lib";
import type { Clock, KeyValueStorage, TimerHandle } from "@/shared/lib";

import { DRAFT_DEBOUNCE_MS } from "../config/constants";
import { parseDraft, serializeDraft } from "./draftBuffer";
import type { DraftFields } from "./draftBuffer";

export type DraftSaveState = "idle" | "pending" | "saved";

type UseStatementDraftOptions = {
  storage: KeyValueStorage;
  storageKey: string;
  /** Поля по умолчанию, если черновика в буфере нет (напр. enteredText попытки). */
  initialFields?: DraftFields;
  /** Вызывается после записи буфера — «сохранение» ввода (CardEvent.enteredText). */
  onCommit?: (fields: DraftFields) => void;
  debounceMs?: number;
  clock?: Clock;
};

function readInitial(storage: KeyValueStorage, storageKey: string, initialFields: DraftFields) {
  const restored = parseDraft(storage.get(storageKey));
  return restored ? { ...initialFields, ...restored.fields } : initialFields;
}

/** Черновик полей ввода с автосохранением в буфер (debounce) и восстановлением после перезагрузки. */
export function useStatementDraft(options: UseStatementDraftOptions) {
  const { storage, storageKey, initialFields = {}, onCommit } = options;
  const { debounceMs = DRAFT_DEBOUNCE_MS, clock = systemClock } = options;
  const [fields, setFields] = useState<DraftFields>(() => readInitial(storage, storageKey, initialFields));
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const fieldsRef = useRef(fields);
  const pending = useRef<{ timer: TimerHandle; fields: DraftFields } | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const persist = useCallback(
    (next: DraftFields) => {
      storage.set(storageKey, serializeDraft({ fields: next, savedAt: clock.now() }));
      commitRef.current?.(next);
    },
    [storage, storageKey, clock],
  );

  const flush = useCallback(() => {
    const scheduled = pending.current;
    if (!scheduled) return;
    clock.clearTimeout(scheduled.timer);
    pending.current = null;
    persist(scheduled.fields);
    setSaveState("saved");
  }, [clock, persist]);

  const setField = useCallback(
    (field: string, value: string) => {
      const next = { ...fieldsRef.current, [field]: value };
      fieldsRef.current = next;
      setFields(next);
      if (pending.current) clock.clearTimeout(pending.current.timer);
      pending.current = { fields: next, timer: clock.setTimeout(() => flush(), debounceMs) };
      setSaveState("pending");
    },
    [clock, debounceMs, flush],
  );

  useEffect(() => flush, [flush]);

  return { fields, setField, saveState, flush };
}
