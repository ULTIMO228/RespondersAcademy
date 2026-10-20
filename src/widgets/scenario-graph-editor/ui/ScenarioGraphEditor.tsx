"use client";

import { useMemo, useState } from "react";

import { EmptyState, ErrorState, ServerRequiredState, Skeleton } from "@/shared/ui/platform";
import type { GraphNodeType } from "@/shared/api";

import { defaultScenarioGraphEditorApi } from "../api/graphEditorApi";
import type { ScenarioGraphEditorApi } from "../api/graphEditorApi";
import { autoLayout } from "../lib/layout";
import { findNode, findUnusedNodes, NODE_KIND_LABEL } from "../lib/model";
import { useGraphEditor } from "../model/useGraphEditor";
import { Btn } from "./controls";
import { CreateGraphForm } from "./CreateGraphForm";
import { GraphCanvas } from "./GraphCanvas";
import { GraphSettings } from "./GraphSettings";
import { NodeProperties } from "./NodeProperties";
import { ValidationList } from "./ValidationList";
import { VersionPanel } from "./VersionPanel";

import styles from "./Editor.module.css";

export type ScenarioGraphEditorProps = {
  scenarioId: string;
  /** Категории (группы ЕКП) для формы создания графа. */
  categories?: string[];
  api?: ScenarioGraphEditorApi;
};

const PALETTE: { kind: GraphNodeType; label: string }[] = [
  { kind: "action", label: "Шаг (действие)" },
  { kind: "condition", label: "Условие" },
  { kind: "end", label: "Завершение" },
];

/** Визуальный редактор графа сценария 112: холст, палитра, свойства, проверка и процесс версий. */
export function ScenarioGraphEditor({
  scenarioId,
  categories = [],
  api = defaultScenarioGraphEditorApi,
}: ScenarioGraphEditorProps) {
  const ed = useGraphEditor({ scenarioId, api });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { graph, editor } = ed;

  const errorNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of ed.local) if (item.nodeId) ids.add(item.nodeId);
    if (ed.validation.status === "done")
      for (const item of ed.validation.errors) if (item.nodeId) ids.add(item.nodeId);
    return ids;
  }, [ed.local, ed.validation]);
  const unusedIds = useMemo(() => new Set(graph && graph.start ? findUnusedNodes(graph) : []), [graph]);

  if (ed.load.status === "loading") return <Skeleton lines={5} label="Загрузка версий сценария…" />;
  if (ed.load.status === "error") {
    return ed.load.serverRequired ? (
      <ServerRequiredState onRetry={ed.retry} />
    ) : (
      <ErrorState title="Не удалось загрузить граф сценария" message={ed.load.message} onRetry={ed.retry} />
    );
  }

  if (!graph || !ed.size) {
    return (
      <section className={styles.root} aria-label="Граф сценария">
        <EmptyState
          title="У сценария ещё нет графа"
          text="Создайте граф из источника: появится шаблон «шаг → завершение», который можно развить на холсте."
        />
        {ed.notice ? (
          <p
            role={ed.notice.kind === "error" ? "alert" : "status"}
            className={ed.notice.kind === "error" ? styles.error : styles.ok}
          >
            {ed.notice.text}
          </p>
        ) : null}
        {ed.latest ? (
          <div className={styles.attach}>
            <p>
              У сценария есть версия {ed.latest.version} без графа. Можно добавить к ней шаблонный граф новой
              версией.
            </p>
            <Btn onClick={() => void ed.attachTemplate()} disabled={ed.busy || ed.actions.readOnly}>
              Добавить граф к текущему сценарию
            </Btn>
          </div>
        ) : null}
        <CreateGraphForm
          api={api}
          categories={categories}
          busy={ed.busy}
          onCreate={(input) => void ed.create(input)}
        />
      </section>
    );
  }

  const selected = findNode(graph, ed.selectedId);
  const readOnly = ed.actions.readOnly;
  const nodeToDelete = findNode(graph, pendingDelete);

  return (
    <section className={styles.root} aria-label="Граф сценария">
      {ed.latest ? (
        <VersionPanel
          version={ed.latest}
          actions={ed.actions}
          dirty={ed.dirty}
          busy={ed.busy}
          notice={ed.notice}
          onSave={() => void ed.save()}
          onSubmit={() => void ed.submit()}
          onReview={(decision, comment) => void ed.review(decision, comment)}
          onPublish={() => void ed.publish()}
        />
      ) : null}
      <div className={styles.toolbar} role="toolbar" aria-label="Палитра блоков">
        {PALETTE.map((item) => (
          <Btn key={item.kind} onClick={() => editor.addNode(item.kind)} disabled={readOnly}>
            + {item.label}
          </Btn>
        ))}
        <Btn onClick={() => editor.patchGraph({ layout: autoLayout(graph) })} disabled={readOnly}>
          Расставить блоки заново
        </Btn>
      </div>
      <p className={styles.muted}>
        Клавиатура: Tab — переход по блокам, Enter — выбрать, стрелки — сдвинуть выбранный блок (с Shift — на
        50), Delete — удалить. Соединение: перетащите круглый порт блока на другой блок или выберите цель в
        панели свойств.
      </p>
      {pendingDelete && nodeToDelete ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Подтверждение удаления блока">
          <p>
            Удалить блок «{nodeToDelete.title || nodeToDelete.id}» ({NODE_KIND_LABEL[nodeToDelete.type]})?
            Ссылки на него будут очищены.
          </p>
          <div className={styles.versions__buttons}>
            <Btn
              variant="danger"
              onClick={() => {
                editor.removeNode(nodeToDelete.id);
                setPendingDelete(null);
              }}
            >
              Удалить блок
            </Btn>
            <Btn onClick={() => setPendingDelete(null)}>Отмена</Btn>
          </div>
        </div>
      ) : null}
      {graph.nodes.length === 0 ? (
        <EmptyState
          title="В графе нет блоков"
          text="Добавьте первый блок из палитры: первый добавленный блок станет стартовым."
        />
      ) : null}
      <div className={styles.workspace}>
        <div className={styles.workspace__main}>
          <GraphCanvas
            graph={graph}
            size={ed.size}
            selectedId={ed.selectedId}
            errorNodeIds={errorNodeIds}
            unusedIds={unusedIds}
            readOnly={readOnly}
            onSelect={ed.select}
            onMove={editor.moveNode}
            onConnect={editor.connect}
            onDeleteRequest={setPendingDelete}
          />
          <ValidationList
            local={ed.local}
            validation={ed.validation}
            onPick={ed.select}
            onCheck={() => void ed.runCheck()}
          />
        </div>
        <div className={styles.workspace__side}>
          {selected ? (
            <NodeProperties
              key={selected.id}
              node={selected}
              graph={graph}
              readOnly={readOnly}
              actions={{
                update: (patch) => editor.updateNode(selected.id, patch),
                rename: (newId) => editor.rename(selected.id, newId),
                connect: (slot, target) => editor.connect(selected.id, slot, target),
                addBranch: () => editor.addBranch(selected.id),
                removeBranch: (index) => editor.removeBranch(selected.id, index),
                updateBranch: (index, patch) => editor.updateBranch(selected.id, index, patch),
                setStart: () => editor.patchGraph({ start: selected.id }),
                requestDelete: () => setPendingDelete(selected.id),
              }}
            />
          ) : (
            <p className={styles.muted}>Выберите блок на холсте, чтобы изменить его свойства.</p>
          )}
          <GraphSettings graph={graph} readOnly={readOnly} onChange={editor.patchGraph} />
        </div>
      </div>
    </section>
  );
}
