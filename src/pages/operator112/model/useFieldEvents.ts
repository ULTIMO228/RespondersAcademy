"use client";

import { useCallback, useEffect, useRef } from "react";

import type { OperatorEventRequest } from "@/shared/api";

export const FIELD_EVENT_DELAY_MS = 700;

type Send = (event: OperatorEventRequest) => Promise<unknown>;

/**
 * События fieldChanged с задержкой: каждое нажатие клавиши в поле не порождает запрос, уходит последнее значение поля.
 * flush() отправляет отложенное немедленно (перед передачей карточки и при уходе со страницы); сбои событий не блокируют ввод —
 * их сообщение уходит в onError.
 */
export function useFieldEvents(send: Send, onError: (message: string) => void) {
  const pending = useRef(new Map<string, { value: unknown; timer: ReturnType<typeof setTimeout> }>());
  const sendRef = useRef(send);
  sendRef.current = send;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const dispatch = useCallback((field: string, value: unknown) => {
    sendRef.current({ type: "fieldChanged", payload: { field, value } }).catch((error: unknown) => {
      errorRef.current(error instanceof Error && error.message ? error.message : "Не удалось сохранить поле");
    });
  }, []);

  const queue = useCallback(
    (field: string, value: unknown) => {
      const previous = pending.current.get(field);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => {
        pending.current.delete(field);
        dispatch(field, value);
      }, FIELD_EVENT_DELAY_MS);
      pending.current.set(field, { value, timer });
    },
    [dispatch],
  );

  const flush = useCallback(() => {
    for (const [field, entry] of pending.current) {
      clearTimeout(entry.timer);
      dispatch(field, entry.value);
    }
    pending.current.clear();
  }, [dispatch]);

  useEffect(() => flush, [flush]);

  return { queue, flush };
}
