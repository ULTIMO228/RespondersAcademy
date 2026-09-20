"use client";

import { useEffect, useState } from "react";

import type { ReferenceData } from "@/shared/api";

import { useJournalDeps } from "./deps";
import { isAbortError, toFailureStatus } from "./loadStatus";
import type { LoadStatus } from "./types";

/** Справочники мок-слоя (GET /api/mock/reference) — названия служб и статусов для строк ленты. */
export function useReference() {
  const { api } = useJournalDeps();
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getReference(controller.signal)
      .then((data) => {
        setReference(data);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setStatus(toFailureStatus(error));
      });
    return () => controller.abort();
  }, [api, attempt]);

  return { reference, status, retry: () => setAttempt((current) => current + 1) };
}
