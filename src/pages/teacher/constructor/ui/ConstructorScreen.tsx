"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createDemoGraph,
  createEmptyGraph,
  edgeFromPort,
  finishPreview,
  graphBounds,
  nodeById,
  nodeSize,
  outputsOf,
  recordPreviewEvent,
  scorePreview,
  startPreview,
  validateFlow,
  waitPreview,
} from "@/entities/scenario-flow";
import type {
  FlowBlockDraft,
  FlowDictionaries,
  FlowPoint,
  PreviewEvent,
  PreviewState,
} from "@/entities/scenario-flow";
import { FlowCanvas } from "@/features/flow/canvas";
import type { FlowPlacement, NodeMark } from "@/features/flow/canvas";
import { FlowInspector } from "@/features/flow/inspector";
import { FlowLibrary } from "@/features/flow/library";
import { FlowPreviewPanel } from "@/features/flow/preview";
import { createWebStorage } from "@/shared/lib";
import type { KeyValueStorage } from "@/shared/lib";
import { PlatformButton } from "@/shared/ui/platform";

import { useFlowEditor } from "../model/useFlowEditor";
import styles from "./ConstructorScreen.module.css";
import { EditorToolbar } from "./EditorToolbar";
import type { EditorView } from "./EditorToolbar";
import { IssuesPanel } from "./IssuesPanel";
import { KeysDialog } from "./KeysDialog";
import { OutlineView } from "./OutlineView";

const browserStorage = createWebStorage(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
);
const SNACKBAR_MS = 10_000;
const systemNow = () => new Date();
const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const GAP_Y = 72;

type ConstructorScreenProps = {
  dictionaries: FlowDictionaries;
  /** Хранилище черновика (в тестах — память). */
  storage?: KeyValueStorage;
  /** Часы и зерно случайности прогона (в тестах — фиксированные). */
  now?: () => Date;
  seed?: () => number;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * `/teacher/constructor` — кликабельный прототип визуального конструктора (фича 013, design-concept.md): библиотека
 * слева, поле со схемой и мини-картой в центре, свойства справа, действия сверху, проверка и история снизу.
 * Сервер не используется: черновик хранится в браузере, публикация недоступна до серверной фазы.
 */
export function ConstructorScreen({
  dictionaries: dict,
  storage = browserStorage,
  now = systemNow,
  seed = randomSeed,
}: ConstructorScreenProps) {
  const { state, dispatch, save, status, restored } = useFlowEditor({ storage, now });
  const { graph, selection } = state;
  const [view, setView] = useState<EditorView>("schema");
  const [hideAnswers, setHideAnswers] = useState(false);
  const [panelTab, setPanelTab] = useState<"issues" | "history">("issues");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [announce, setAnnounce] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const regions = {
    toolbar: useRef<HTMLDivElement>(null),
    library: useRef<HTMLDivElement>(null),
    canvas: useRef<HTMLDivElement>(null),
    inspector: useRef<HTMLElement>(null),
    panel: useRef<HTMLElement>(null),
  };
  const revealNext = useRef(false);
  // Клавиши читают актуальное «сохранить»: Ctrl + S сразу после правки поля не должен сохранить прежний граф.
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });

  const report = useMemo(() => validateFlow(graph, dict), [graph, dict]);
  const issues = useMemo(() => [...report.errors, ...report.warnings], [report]);
  const stamp = useCallback(() => now().toISOString(), [now]);
  const previewing = preview !== null;

  /* ——— показ блока после добавления и по ссылке из ошибок ——— */
  const show = useCallback(
    (id: string) => {
      setView("schema");
      dispatch({ type: "select", selection: { kind: "node", id } });
      setFocusRequest({ id, nonce: Date.now() });
    },
    [dispatch],
  );

  useEffect(() => {
    if (!revealNext.current || selection?.kind !== "node") return;
    revealNext.current = false;
    setFocusRequest({ id: selection.id, nonce: Date.now() });
  }, [selection]);

  /* ——— добавление блока ——— */
  const addBlock = (draft: FlowBlockDraft, position: FlowPoint, placement?: FlowPlacement) => {
    revealNext.current = true;
    dispatch({
      type: "addNode",
      nodeType: draft.type,
      props: draft.props,
      title: draft.title,
      position,
      ...placement,
      at: stamp(),
    });
  };

  /** Из библиотеки: после выбранного шага (в первый свободный выход), иначе — под схемой. */
  const addFromLibrary = (draft: FlowBlockDraft) => {
    const selected = selection?.kind === "node" ? nodeById(graph, selection.id) : undefined;
    if (selected && outputsOf(selected).length) {
      const outputs = outputsOf(selected);
      const free = outputs.find((output) => !edgeFromPort(graph, selected.id, output.port)) ?? outputs[0];
      const index = outputs.indexOf(free);
      const { width, height } = nodeSize(selected);
      const x = selected.position.x + (width / outputs.length) * (index + 0.5) - 150;
      addBlock(
        draft,
        { x: Math.round(x / 8) * 8, y: selected.position.y + height + GAP_Y },
        { after: { node: selected.id, port: free.port } },
      );
      return;
    }
    const bounds = graphBounds(graph);
    addBlock(draft, { x: bounds.x, y: bounds.y + bounds.height + GAP_Y });
  };

  /* ——— пробный прогон ——— */
  const startTest = () => {
    if (!report.ok) {
      setPanelTab("issues");
      setCheckedAt(now());
      setAnnounce(
        `Запустить тест пока нельзя: ошибок ${report.errors.length}. Список — в панели «Проверка».`,
      );
      regions.panel.current?.focus();
      return;
    }
    setView("schema");
    dispatch({ type: "select", selection: null });
    setPreview(startPreview(graph, dict, { seed: seed() }));
    setAnnounce("Пробный прогон начат");
  };
  const previewResult = useMemo(
    () => (preview?.finished ? scorePreview(graph, dict, preview) : null),
    [preview, graph, dict],
  );
  const marks = useMemo(() => {
    if (!preview) return undefined;
    const map = new Map<string, NodeMark>();
    for (const step of preview.steps) {
      if (step.virtual)
        map.set(
          step.nodeId,
          ["missed", "wrong"].includes(step.outcome ?? "") ? "missed" : (map.get(step.nodeId) ?? null),
        );
      else if (step.outcome === "missed" || step.outcome === "wrong") map.set(step.nodeId, "missed");
      else if (step.outcome) map.set(step.nodeId, "done");
    }
    if (preview.activeNodeId) map.set(preview.activeNodeId, "active");
    return map;
  }, [preview]);

  /* ——— проверка ——— */
  const validateNow = () => {
    setCheckedAt(now());
    setPanelTab("issues");
    setAnnounce(
      report.ok
        ? `Проверка: ошибок нет${report.warnings.length ? `, предупреждений: ${report.warnings.length}` : ""}.`
        : `Проверка: ошибок ${report.errors.length}, предупреждений ${report.warnings.length}.`,
    );
  };

  /* ——— сообщение «Шаг удалён · Вернуть» ——— */
  const notice = state.notice;
  useEffect(() => {
    if (notice?.kind !== "removed") return;
    const timer = setTimeout(() => dispatch({ type: "dismissNotice" }), SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);

  /* ——— клавиши уровня экрана ——— */
  useEffect(() => {
    const order = [regions.toolbar, regions.library, regions.canvas, regions.inspector, regions.panel];
    const onKey = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === "F6") {
        event.preventDefault();
        const current = order.findIndex((region) => region.current?.contains(document.activeElement));
        const next =
          order[(current + (event.shiftKey ? order.length - 1 : 1) + order.length) % order.length].current;
        (
          next?.querySelector<HTMLElement>(
            "[tabindex='0'], button:not(:disabled), input, select, textarea",
          ) ?? next
        )?.focus();
        return;
      }
      if (ctrl && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!previewing) saveRef.current();
        return;
      }
      if (isTyping(event.target) || previewing) return;
      if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (event.key === "?") {
        setShowKeys(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // regions — стабильные ref-объекты.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, previewing]);

  const canvasProps = {
    graph,
    dict,
    selection,
    issues,
    marks,
    readOnly: previewing,
    hideAnswers,
    focusRequest,
    onSelect: (next: typeof selection) => dispatch({ type: "select", selection: next }),
    onMoveStart: (id: string) =>
      dispatch({
        type: "checkpoint",
        label: `Передвинут блок «${nodeById(graph, id)?.title?.trim() || "блок"}»`,
        at: stamp(),
      }),
    onMove: (id: string, position: FlowPoint, record: boolean) =>
      dispatch({ type: "moveNode", id, position, record, at: stamp() }),
    onConnect: (from: { node: string; port: string }, to: string) =>
      dispatch({ type: "connect", from, to, at: stamp() }),
    onAdd: addBlock,
    onDelete: () => dispatch({ type: "deleteSelection", at: stamp() }),
    onAlign: () => dispatch({ type: "autoLayout", at: stamp() }),
    onShowKeys: () => setShowKeys(true),
    onOpenInspector: () =>
      regions.inspector.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(),
  };

  return (
    <div className={styles.screen}>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      <EditorToolbar
        ref={regions.toolbar}
        title={graph.title}
        status={status}
        previewing={previewing}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        view={view}
        errors={report.errors.length}
        hideAnswers={hideAnswers}
        onView={setView}
        onToggleAnswers={() => {
          setHideAnswers((value) => !value);
          setAnnounce(hideAnswers ? "Ответы показаны" : "Ответы скрыты");
        }}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={() =>
          setAnnounce(save() ? "Сценарий сохранён в этом браузере" : "Не удалось сохранить в браузере")
        }
        onValidate={validateNow}
        onTest={startTest}
        onStopTest={() => setPreview(null)}
        onNew={() =>
          dispatch({
            type: "replaceGraph",
            graph: createEmptyGraph("Новый сценарий", graph.mode),
            label: "Создан новый пустой сценарий",
            at: stamp(),
          })
        }
        onExample={() =>
          dispatch({
            type: "replaceGraph",
            graph: createDemoGraph(),
            label: "Открыт пример: билет 4.1",
            at: stamp(),
          })
        }
      />
      <p className={styles.banner} role="note">
        Прототип: сценарий хранится только в этом браузере{restored ? " (черновик восстановлен)" : ""}.
        Публикация и назначение студентам появятся вместе с сервером конструктора.
      </p>
      {notice?.kind === "cycle" ? (
        <div className={styles.alert} role="alert">
          Так получится круг: сценарий не сможет закончиться. Связь не создана.
          <PlatformButton
            variant="ghost"
            className={styles.button}
            onClick={() => dispatch({ type: "dismissNotice" })}
          >
            Понятно
          </PlatformButton>
        </div>
      ) : null}
      {status.kind === "failed" ? (
        <div className={styles.alert} role="alert">
          Не удалось сохранить черновик в браузере (приватный режим или нет места). Изменения есть только на
          этой странице.
        </div>
      ) : null}

      <div className={styles.body}>
        <div ref={regions.library} className={styles.region}>
          <FlowLibrary mode={graph.mode} onAdd={addFromLibrary} disabled={previewing} />
        </div>
        <div ref={regions.canvas} className={styles.region}>
          {view === "schema" ? (
            <FlowCanvas {...canvasProps} />
          ) : (
            <OutlineView
              graph={graph}
              dict={dict}
              selection={selection}
              issues={issues}
              hideAnswers={hideAnswers}
              onSelect={(id) => dispatch({ type: "select", selection: { kind: "node", id } })}
            />
          )}
        </div>
        {preview ? (
          <FlowPreviewPanel
            graph={graph}
            dict={dict}
            state={preview}
            result={previewResult}
            onEvent={(event: Omit<PreviewEvent, "at">) =>
              setPreview((current) => (current ? recordPreviewEvent(graph, dict, current, event) : current))
            }
            onWait={(seconds) =>
              setPreview((current) => (current ? waitPreview(graph, dict, current, seconds) : current))
            }
            onFinish={() => setPreview((current) => (current ? finishPreview(graph, current) : current))}
            onRestart={() => setPreview(startPreview(graph, dict, { seed: seed() }))}
            onStop={() => setPreview(null)}
          />
        ) : (
          <FlowInspector
            ref={regions.inspector}
            graph={graph}
            dict={dict}
            selection={selection}
            issues={issues}
            onUpdateNode={(id, patch) => dispatch({ type: "updateNode", id, ...patch, at: stamp() })}
            onConnect={(from, to) => dispatch({ type: "connect", from, to, at: stamp() })}
            onDisconnect={(from) => dispatch({ type: "disconnect", from, at: stamp() })}
            onDeleteNode={(id) => dispatch({ type: "deleteNode", id, at: stamp() })}
            onDuplicateNode={(id) => {
              revealNext.current = true;
              dispatch({ type: "duplicateNode", id, at: stamp() });
            }}
            onDeleteEdge={(id) => dispatch({ type: "deleteEdge", id, at: stamp() })}
            onUpdateGraph={(patch) => dispatch({ type: "updateGraph", patch, at: stamp() })}
            onUpdateSettings={(patch) => dispatch({ type: "updateSettings", patch, at: stamp() })}
          />
        )}
      </div>

      <IssuesPanel
        ref={regions.panel}
        report={report}
        checkedAt={checkedAt}
        log={state.log}
        past={state.past}
        tab={panelTab}
        onTab={setPanelTab}
        onShow={show}
      />

      {notice?.kind === "removed" ? (
        <div className={styles.snackbar} role="status">
          {notice.label}
          <PlatformButton className={styles.snackbar__button} onClick={() => dispatch({ type: "undo" })}>
            Вернуть
          </PlatformButton>
        </div>
      ) : null}
      {showKeys ? <KeysDialog onClose={() => setShowKeys(false)} /> : null}
    </div>
  );
}
