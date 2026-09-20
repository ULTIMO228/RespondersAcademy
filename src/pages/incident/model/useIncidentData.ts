"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api";

import { loadIncident } from "./loadIncident";
import type { IncidentData, LoadIncidentInput } from "./loadIncident";

export type IncidentLoadState =
  | { status: "loading" }
  | { status: "notFound"; message: string }
  | { status: "error"; message: string; isOffline: boolean }
  | { status: "ready"; data: IncidentData };

const NOT_FOUND_STATUS = 404;
const NETWORK_STATUS = 0;

function toFailure(reason: unknown): IncidentLoadState {
  if (reason instanceof ApiError && reason.status === NOT_FOUND_STATUS) {
    return { status: "notFound", message: reason.message };
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    status: "error",
    message,
    isOffline: reason instanceof ApiError && reason.status === NETWORK_STATUS,
  };
}

/** Состояния загрузки экрана карточки: loading / notFound / error (в т.ч. offline) / ready. */
export function useIncidentData({ cardId, studentId, issuedAt }: LoadIncidentInput) {
  const [state, setState] = useState<IncidentLoadState>({ status: "loading" });
  const [attemptNo, setAttemptNo] = useState(0);
  const retry = useCallback(() => setAttemptNo((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadIncident({ cardId, studentId, issuedAt }, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setState(toFailure(reason));
      });
    return () => controller.abort();
  }, [cardId, studentId, issuedAt, attemptNo]);

  return { state, retry };
}
