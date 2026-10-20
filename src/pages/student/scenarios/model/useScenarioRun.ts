"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ServerRequiredError } from "@/shared/api";
import type { ScenarioRunView } from "@/shared/api";

import type { StudentScenariosApi } from "../api/scenariosApi";
import { classifyActionError, PENALTY_NOTE } from "../lib/messages";

export type RunState =
  | { status: "loading" }
  | { status: "serverRequired" }
  | { status: "error"; message: string }
  | { status: "ready"; run: ScenarioRunView };

export type RunNotice = { kind: "wrong" | "stale" | "other"; text: string; note?: string } | null;

function loadError(error: unknown, fallback: string): RunState {
  if (error instanceof ServerRequiredError) return { status: "serverRequired" };
  return { status: "error", message: error instanceof Error && error.message ? error.message : fallback };
}

type Options = { scenarioId: string; version: number; api: StudentScenariosApi };

/**
 * Прохождение версии сценария: запуск или продолжение прогона при входе, действие, прерывание, повтор.
 * Действие всегда уходит с expectedSteps = текущему steps и (только для шага с input) с выбранным вариантом.
 * После отказа 409 состояние перечитывается с сервера.
 */
export function useScenarioRun({ scenarioId, version, api }: Options) {
  const [state, setState] = useState<RunState>({ status: "loading" });
  const [notice, setNotice] = useState<RunNotice>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastLoadRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    setNotice(null);
    api.start(scenarioId, version, controller.signal).then(
      (run) => {
        if (!controller.signal.aborted) setState({ status: "ready", run });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(loadError(error, "Не удалось начать прохождение"));
      },
    );
    return () => controller.abort();
  }, [api, scenarioId, version, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const perform = useCallback(
    async (action: string, choice: string | null) => {
      if (state.status !== "ready" || busy) return;
      const { run } = state;
      setBusy(true);
      setNotice(null);
      const seq = ++lastLoadRef.current;
      try {
        const next = await api.act(run.runId, {
          action,
          expectedSteps: run.steps,
          ...(run.step?.input && choice !== null ? { choice } : {}),
        });
        if (seq === lastLoadRef.current) setState({ status: "ready", run: next });
      } catch (error) {
        const failure = classifyActionError(error);
        setNotice({
          kind: failure.kind,
          text: failure.message,
          note: failure.kind === "wrong" ? PENALTY_NOTE : undefined,
        });
        if (failure.kind === "wrong" || failure.kind === "stale") {
          try {
            const fresh = await api.get(run.runId);
            if (seq === lastLoadRef.current) setState({ status: "ready", run: fresh });
          } catch {
            /* прежний вид остаётся на экране: сообщение об отказе уже показано */
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [api, busy, state],
  );

  const abort = useCallback(async () => {
    if (state.status !== "ready" || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await api.finish(state.run.runId);
      setState({ status: "ready", run: next });
    } catch (error) {
      setNotice({
        kind: "other",
        text: error instanceof Error && error.message ? error.message : "Не удалось прервать прохождение",
      });
    } finally {
      setBusy(false);
    }
  }, [api, busy, state]);

  return { state, notice, busy, perform, abort, restart: reload, retry: reload };
}
