"use client";

import { useEffect, useState } from "react";

import { ApiError, getAttemptEvaluation } from "@/shared/api";
import type { Evaluation } from "@/shared/api";

export type EvaluationState =
  | { status: "loading" }
  | { status: "ready"; evaluation: Evaluation }
  | { status: "pending"; message: string }
  | { status: "error"; message: string };

const NOT_FOUND_STATUS = 404;

/** Мок-оценка завершённой попытки: GET /attempts/[id]/evaluation (ИИ-шлюз мок-слоя). */
export function useAttemptEvaluation(attemptId: string, isCompleted: boolean): EvaluationState {
  const [state, setState] = useState<EvaluationState>({ status: "loading" });

  useEffect(() => {
    if (!isCompleted) return undefined;
    const controller = new AbortController();
    getAttemptEvaluation(attemptId, controller.signal)
      .then((evaluation) => setState({ status: "ready", evaluation }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        const isPending = reason instanceof ApiError && reason.status === NOT_FOUND_STATUS;
        setState({ status: isPending ? "pending" : "error", message });
      });
    return () => controller.abort();
  }, [attemptId, isCompleted]);

  return state;
}
