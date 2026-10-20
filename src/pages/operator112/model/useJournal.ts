"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ServerRequiredError } from "@/shared/api";
import type { Journal112Row } from "@/shared/api";

import type { Operator112Api } from "../api/operator112Api";

export type JournalState = {
  status: "loading" | "error" | "ready";
  rows: Journal112Row[];
  error: string;
};

const LOAD_ERROR = "Не удалось загрузить журнал";

function toMessage(error: unknown): string {
  if (error instanceof ServerRequiredError) return error.message;
  return error instanceof Error && error.message ? error.message : LOAD_ERROR;
}

/**
 * Журнал «Поиск происшествий» ученика-112 (спека 009, US1). Перечитывается при смене refreshKey (события попытки: вызов
 * принят, окно закрыто «×», карточка сохранена) и по reload(). Обновление не сбрасывает уже показанные строки в «loading»;
 * ответ устаревшего запроса отбрасывается.
 */
export function useJournal(api: Operator112Api, assignmentId: string, refreshKey: string) {
  const [state, setState] = useState<JournalState>({ status: "loading", rows: [], error: "" });
  const [bump, setBump] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    api.journal(assignmentId).then(
      (response) => {
        if (id === seq.current) setState({ status: "ready", rows: response.rows, error: "" });
      },
      (error: unknown) => {
        if (id === seq.current)
          setState((current) => ({ ...current, status: "error", error: toMessage(error) }));
      },
    );
    return () => {
      seq.current += 1;
    };
  }, [api, assignmentId, refreshKey, bump]);

  const reload = useCallback(() => setBump((value) => value + 1), []);
  return { ...state, reload };
}
