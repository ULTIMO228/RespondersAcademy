"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type {
  AIScenarioVersion,
  AIWorkflowMode,
  GraphNode,
  GraphNodeType,
  GraphValidationError,
  ScenarioPermission,
} from "@/shared/api";

import type { ScenarioGraphEditorApi } from "../api/graphEditorApi";
import { canvasSize, ensureLayout } from "../lib/layout";
import {
  addBranch,
  addNode,
  fromGraph,
  graphSignature,
  localChecks,
  moveNode,
  removeBranch,
  removeNode,
  renameNode,
  setConnection,
  toGraph,
  updateBranch,
  updateNode,
} from "../lib/model";
import type { BranchPatch, EdgeSlot, EditorGraph } from "../lib/model";
import { newRequestId, templateGraph, workflowActions } from "../lib/workflow";

export type LoadState =
  { status: "loading" } | { status: "error"; message: string; serverRequired: boolean } | { status: "ready" };

export type ValidationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; errors: GraphValidationError[]; valid: boolean }
  | { status: "failed"; message: string };

export type Notice = { kind: "success" | "error"; text: string } | null;

export type CreateInput = {
  mode: AIWorkflowMode;
  sourceTicketId: string;
  category: string;
  title: string;
  summary: string;
};

const VALIDATE_DEBOUNCE_MS = 800;
const NO_GRAPH_SCENARIO_ERRORS = [404];

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ServerRequiredError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

type Options = { scenarioId: string; api: ScenarioGraphEditorApi };

/** Состояние редактора графа: версии, права, рабочий граф, проверка на сервере и процесс версий. */
export function useGraphEditor({ scenarioId: initialScenarioId, api }: Options) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [versions, setVersions] = useState<AIScenarioVersion[]>([]);
  const [permissions, setPermissions] = useState<ScenarioPermission[]>([]);
  const [graph, setGraph] = useState<EditorGraph | null>(null);
  const [savedSignature, setSavedSignature] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const checkSeq = useRef(0);

  const latest = versions.at(-1) ?? null;
  const scenarioId = latest?.scenarioId ?? initialScenarioId;

  const adopt = useCallback((version: AIScenarioVersion, list: AIScenarioVersion[]) => {
    setVersions(list);
    if (version.graph) {
      const state = ensureLayout(fromGraph(version.graph));
      setGraph(state);
      setSavedSignature(graphSignature(state));
      setSelectedId((current) =>
        current && state.nodes.some((node) => node.id === current) ? current : null,
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    (async () => {
      try {
        const [list, perms] = await Promise.all([
          api.listAIScenarioVersions(initialScenarioId, controller.signal).catch((error: unknown) => {
            // Сценария без AI-версий в бэкенде может не быть вовсе — это «пусто», а не сбой.
            if (
              error instanceof ApiError &&
              !(error instanceof ServerRequiredError) &&
              NO_GRAPH_SCENARIO_ERRORS.includes(error.status)
            ) {
              return [] as AIScenarioVersion[];
            }
            throw error;
          }),
          api
            .getScenarioPermissions(controller.signal)
            .then((response) => response.permissions)
            .catch(() => [] as ScenarioPermission[]),
        ]);
        if (controller.signal.aborted) return;
        setPermissions(perms);
        const withGraph = [...list].reverse().find((version) => version.graph);
        setVersions(list);
        if (withGraph) adopt(withGraph, list);
        setLoad({ status: "ready" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoad({
          status: "error",
          message: errorMessage(error, "Не удалось загрузить версии сценария"),
          serverRequired: error instanceof ServerRequiredError,
        });
      }
    })();
    return () => controller.abort();
  }, [api, initialScenarioId, adopt, reloadKey]);

  const dirty = graph !== null && graphSignature(graph) !== savedSignature;
  const actions = useMemo(
    () => workflowActions(latest?.approval ?? null, permissions, dirty),
    [latest?.approval, permissions, dirty],
  );
  const size = useMemo(() => (graph ? canvasSize(graph) : null), [graph]);
  const local = useMemo(() => (graph ? localChecks(graph) : []), [graph]);

  const edit = useCallback((change: (state: EditorGraph) => EditorGraph) => {
    setGraph((current) => (current ? change(current) : current));
    setNotice(null);
  }, []);

  const runCheck = useCallback(async () => {
    if (!graph) return;
    const seq = ++checkSeq.current;
    setValidation({ status: "checking" });
    try {
      const result = await api.validateScenarioGraph(toGraph(graph));
      if (seq !== checkSeq.current) return;
      setValidation({ status: "done", errors: result.errors, valid: result.valid });
    } catch (error) {
      if (seq !== checkSeq.current) return;
      setValidation({ status: "failed", message: errorMessage(error, "Не удалось проверить граф") });
    }
  }, [api, graph]);

  // Автопроверка с задержкой после правок; пока есть локальные ошибки, сервер не нагружаем.
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    if (local.length > 0) {
      checkSeq.current += 1;
      return;
    }
    const timer = setTimeout(() => void runCheck(), VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [graph, local.length, runCheck]);

  const perform = useCallback(
    async (
      task: () => Promise<AIScenarioVersion>,
      success: string,
      afterwards?: (version: AIScenarioVersion) => void,
    ) => {
      setBusy(true);
      setNotice(null);
      try {
        const version = await task();
        afterwards?.(version);
        setNotice({ kind: "success", text: success });
        return version;
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error, "Действие не выполнено") });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const replaceVersion = useCallback(
    (version: AIScenarioVersion) => {
      const list = [...versions.filter((item) => item.version !== version.version), version].sort(
        (left, right) => left.version - right.version,
      );
      setVersions(list);
    },
    [versions],
  );

  const create = useCallback(
    (input: CreateInput) =>
      perform(
        () =>
          api.createGraphScenario({
            mode: input.mode,
            sourceTicketId: input.sourceTicketId,
            category: input.category,
            ...(input.title.trim() ? { title: input.title.trim() } : {}),
            summary: input.summary.trim(),
            graph: templateGraph(),
            requestId: newRequestId(),
          }),
        "Сценарий создан, граф открыт для редактирования",
        (version) => {
          const list = [version];
          if (!version.graph) version = { ...version, graph: templateGraph() };
          adopt(version, list);
        },
      ),
    [adopt, api, perform],
  );

  /** Добавляет шаблонный граф к существующей версии без графа (revise с graph). */
  const attachTemplate = useCallback(async () => {
    if (!latest) return null;
    return perform(
      () =>
        api.reviseGraphScenario(scenarioId, {
          baseVersion: latest.version,
          graph: templateGraph(),
          requestId: newRequestId(),
        }),
      "Шаблонный граф добавлен новой версией",
      (version) => adopt({ ...version, graph: version.graph ?? templateGraph() }, [...versions, version]),
    );
  }, [adopt, api, latest, perform, scenarioId, versions]);

  const save = useCallback(async () => {
    if (!graph || !latest || !actions.canSave) return null;
    const payload = toGraph(graph);
    return perform(
      () =>
        api.reviseGraphScenario(scenarioId, {
          baseVersion: latest.version,
          graph: payload,
          requestId: newRequestId(),
        }),
      "Сохранено новой версией",
      (version) => {
        replaceVersion(version);
        setSavedSignature(graphSignature(graph));
      },
    );
  }, [actions.canSave, api, graph, latest, perform, replaceVersion, scenarioId]);

  const submit = useCallback(async () => {
    if (!latest || !actions.canSubmit) return null;
    return perform(
      () => api.submitGraphScenario(scenarioId, { version: latest.version, requestId: newRequestId() }),
      "Версия отправлена на проверку",
      replaceVersion,
    );
  }, [actions.canSubmit, api, latest, perform, replaceVersion, scenarioId]);

  const review = useCallback(
    async (decision: "accept" | "reject", comment: string) => {
      if (!latest || !actions.canReview) return null;
      return perform(
        () =>
          api.reviewGraphScenario(scenarioId, {
            version: latest.version,
            decision,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
            requestId: newRequestId(),
          }),
        decision === "accept" ? "Версия принята" : "Версия отклонена",
        replaceVersion,
      );
    },
    [actions.canReview, api, latest, perform, replaceVersion, scenarioId],
  );

  const publish = useCallback(async () => {
    if (!latest || !actions.canPublish) return null;
    return perform(
      () => api.publishGraphScenario(scenarioId, { version: latest.version, requestId: newRequestId() }),
      "Версия опубликована",
      replaceVersion,
    );
  }, [actions.canPublish, api, latest, perform, replaceVersion, scenarioId]);

  /** Новая версия-черновик из принятой/опубликованной: перечитывает версии и открывает черновик. */
  const derive = useCallback(
    async (comment: string) => {
      if (!latest || latest.approval !== "approved") return null;
      setBusy(true);
      setNotice(null);
      try {
        const created = await api.deriveGraphScenarioVersion(scenarioId, latest.version, {
          requestId: newRequestId(),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        });
        let list: AIScenarioVersion[];
        try {
          list = await api.listAIScenarioVersions(scenarioId);
        } catch {
          list = [...versions.filter((item) => item.version !== created.version), created];
        }
        adopt(created.graph ? created : { ...created, graph: latest.graph }, list);
        setValidation({ status: "idle" });
        setNotice({ kind: "success", text: `Создана версия ${created.version} (черновик)` });
        return created;
      } catch (error) {
        const text =
          error instanceof ApiError && error.status === 409
            ? "Уже есть неопубликованная версия этого сценария. Завершите её (отправьте на проверку или опубликуйте), затем создайте новую."
            : errorMessage(error, "Не удалось создать новую версию");
        setNotice({ kind: "error", text });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [adopt, api, latest, scenarioId, versions],
  );

  const editor = {
    addNode: (kind: GraphNodeType) => {
      if (!graph) return;
      const result = addNode(graph, kind);
      setGraph(result.graph);
      setSelectedId(result.id);
      setNotice(null);
    },
    removeNode: (id: string) => {
      if (!graph) return;
      setGraph(removeNode(graph, id));
      setSelectedId((current) => (current === id ? null : current));
      setNotice(null);
    },
    updateNode: (id: string, patch: Partial<GraphNode>) => edit((state) => updateNode(state, id, patch)),
    moveNode: (id: string, x: number, y: number) =>
      edit((state) => moveNode(state, id, { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) })),
    connect: (from: string, slot: EdgeSlot, target: string) =>
      edit((state) => setConnection(state, from, slot, target)),
    addBranch: (id: string) => edit((state) => addBranch(state, id)),
    removeBranch: (id: string, index: number) => edit((state) => removeBranch(state, id, index)),
    updateBranch: (id: string, index: number, patch: BranchPatch) =>
      edit((state) => updateBranch(state, id, index, patch)),
    patchGraph: (patch: Partial<EditorGraph>) => edit((state) => ({ ...state, ...patch })),
    /** Переименование id; возвращает текст ошибки или null. */
    rename: (oldId: string, newId: string): string | null => {
      if (!graph) return null;
      const result = renameNode(graph, oldId, newId);
      if (!result.ok) return result.error;
      setGraph(result.graph);
      setSelectedId(newId.trim());
      setNotice(null);
      return null;
    },
  };

  return {
    load,
    retry: () => setReloadKey((key) => key + 1),
    scenarioId,
    versions,
    latest,
    permissions,
    graph,
    size,
    dirty,
    actions,
    local,
    validation,
    selectedId,
    select: setSelectedId,
    busy,
    notice,
    setNotice,
    editor,
    runCheck,
    create,
    attachTemplate,
    save,
    submit,
    review,
    publish,
    derive,
  };
}
