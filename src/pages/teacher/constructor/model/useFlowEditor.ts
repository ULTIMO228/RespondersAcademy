"use client";

import { useCallback, useEffect, useReducer, useState } from "react";

import {
  createDemoGraph,
  createEditorState,
  flowEditorReducer,
  parseStoredGraph,
} from "@/entities/scenario-flow";
import type { FlowEditorAction, FlowEditorState, FlowGraph } from "@/entities/scenario-flow";
import type { KeyValueStorage } from "@/shared/lib";

/** Ключ черновика в браузере. Прототип: сервер не используется (решение владельца 2026-10-19). */
export const FLOW_DRAFT_STORAGE_KEY = "ra.flow-constructor.draft.v1";
export const AUTOSAVE_MS = 60_000;

export type SaveStatus =
  { kind: "clean" } | { kind: "dirty" } | { kind: "saved"; at: Date } | { kind: "failed" };

type Action = FlowEditorAction | { type: "load"; graph: FlowGraph };

function reducer(state: FlowEditorState, action: Action): FlowEditorState {
  if (action.type === "load") return createEditorState(action.graph);
  return flowEditorReducer(state, action);
}

type Options = {
  storage: KeyValueStorage;
  now?: () => Date;
};

const systemNow = () => new Date();

/**
 * Состояние редактора + черновик в браузере. Начальный граф — демо (одинаков на сервере и клиенте, без расхождения
 * гидратации); сохранённый черновик подхватывается после монтирования. Автосохранение — через минуту после правки.
 * Статус сохранения не хранится, а выводится из ревизий: так его нельзя перезаписать устаревшим значением.
 */
export function useFlowEditor({ storage, now = systemNow }: Options) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createEditorState(createDemoGraph()));
  const [savedRevision, setSavedRevision] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const stored = parseStoredGraph(storage.get(FLOW_DRAFT_STORAGE_KEY));
    if (stored) dispatch({ type: "load", graph: stored });
    setRestored(Boolean(stored));
  }, [storage]);

  const dirty = state.revision !== savedRevision;
  const status: SaveStatus = failed
    ? { kind: "failed" }
    : dirty
      ? { kind: "dirty" }
      : savedAt
        ? { kind: "saved", at: savedAt }
        : { kind: "clean" };

  const save = useCallback(() => {
    const json = JSON.stringify(state.graph);
    storage.set(FLOW_DRAFT_STORAGE_KEY, json);
    // createWebStorage глушит ошибки (приватный режим, переполнение) — проверяем записью-чтением.
    const ok = storage.get(FLOW_DRAFT_STORAGE_KEY) === json;
    setFailed(!ok);
    if (ok) {
      setSavedRevision(state.revision);
      setSavedAt(now());
    }
    return ok;
  }, [now, state.graph, state.revision, storage]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { state, dispatch: dispatch as (action: FlowEditorAction) => void, save, status, dirty, restored };
}
