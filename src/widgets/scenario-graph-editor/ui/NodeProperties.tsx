"use client";

import { useState } from "react";

import type { GraphNode } from "@/shared/api";

import { NODE_KIND_LABEL } from "../lib/model";
import type { BranchPatch, EdgeSlot, EditorGraph } from "../lib/model";
import { Btn, Checkbox, Select, TextArea, TextInput } from "./controls";
import { InputEditor, SetsEditor } from "./FactEditors";
import { PredicateEditor } from "./PredicateEditor";

import styles from "./Properties.module.css";

const MAX_BRANCHES = 50;

export type NodePropertiesActions = {
  update: (patch: Partial<GraphNode>) => void;
  rename: (newId: string) => string | null;
  connect: (slot: EdgeSlot, target: string) => void;
  addBranch: () => void;
  removeBranch: (index: number) => void;
  updateBranch: (index: number, patch: BranchPatch) => void;
  setStart: () => void;
  requestDelete: () => void;
};

type NodePropertiesProps = {
  node: GraphNode;
  graph: EditorGraph;
  readOnly: boolean;
  actions: NodePropertiesActions;
};

function toNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function TargetSelect({
  label,
  value,
  graph,
  ownId,
  onChange,
}: {
  label: string;
  value: string;
  graph: EditorGraph;
  ownId: string;
  onChange: (target: string) => void;
}) {
  return (
    <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">— не выбрано —</option>
      {graph.nodes.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          {candidate.id} — {NODE_KIND_LABEL[candidate.type]}
          {candidate.title ? ` «${candidate.title}»` : ""}
          {candidate.id === ownId ? " (этот же блок)" : ""}
        </option>
      ))}
    </Select>
  );
}

function IdField({ node, rename }: { node: GraphNode; rename: NodePropertiesActions["rename"] }) {
  const [value, setValue] = useState(node.id);
  const [error, setError] = useState<string | null>(null);
  return (
    <TextInput
      label="Идентификатор блока"
      value={value}
      error={error}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => setError(rename(value))}
      onKeyDown={(event) => {
        if (event.key === "Enter") setError(rename(value));
      }}
    />
  );
}

function ActionFields({ node, graph, actions }: Omit<NodePropertiesProps, "readOnly">) {
  return (
    <>
      <TextArea
        label="Текст для обучающегося (prompt)"
        rows={3}
        maxLength={1000}
        value={node.prompt ?? ""}
        onChange={(event) => actions.update({ prompt: event.target.value })}
      />
      <div className={styles.grid2}>
        <TextInput
          label="Код действия"
          value={node.action ?? ""}
          onChange={(event) => actions.update({ action: event.target.value })}
        />
        <TextInput
          label="Подпись кнопки"
          maxLength={160}
          value={node.label ?? ""}
          onChange={(event) => actions.update({ label: event.target.value })}
        />
      </div>
      <TargetSelect
        label="Следующий блок"
        value={node.next ?? ""}
        graph={graph}
        ownId={node.id}
        onChange={(target) => actions.connect({ kind: "next" }, target)}
      />
      <TextInput
        label="Максимум посещений"
        type="number"
        min={1}
        max={1000}
        value={node.maxVisits ?? ""}
        onChange={(event) => actions.update({ maxVisits: toNumber(event.target.value) })}
      />
      <SetsEditor key={`sets-${node.id}`} sets={node.sets} onChange={(sets) => actions.update({ sets })} />
      <InputEditor input={node.input} onChange={(input) => actions.update({ input })} />
    </>
  );
}

function ConditionFields({ node, graph, actions }: Omit<NodePropertiesProps, "readOnly">) {
  const branches = node.branches ?? [];
  return (
    <>
      <h4 className={styles.subhead}>Ветки условия</h4>
      {branches.map((branch, index) => (
        <fieldset key={index} className={styles.branch}>
          <legend>Ветка {index + 1}</legend>
          <TextInput
            label="Имя ветки"
            maxLength={160}
            value={branch.name}
            onChange={(event) => actions.updateBranch(index, { name: event.target.value })}
          />
          <PredicateEditor
            predicate={branch.when}
            onChange={(when) => actions.updateBranch(index, { when })}
          />
          <TargetSelect
            label={`Куда ведёт ветка «${branch.name}»`}
            value={branch.next}
            graph={graph}
            ownId={node.id}
            onChange={(target) => actions.connect({ kind: "branch", index }, target)}
          />
          {branches.length > 1 ? (
            <Btn variant="danger" onClick={() => actions.removeBranch(index)}>
              Удалить ветку {index + 1}
            </Btn>
          ) : null}
        </fieldset>
      ))}
      <div>
        <Btn onClick={actions.addBranch} disabled={branches.length >= MAX_BRANCHES}>
          Добавить ветку
        </Btn>
      </div>
      <fieldset className={styles.branch}>
        <legend>Ветка «иначе» (обязательна)</legend>
        <TextInput
          label="Имя ветки «иначе»"
          maxLength={160}
          value={node.else?.name ?? ""}
          onChange={(event) =>
            actions.update({ else: { name: event.target.value, next: node.else?.next ?? "" } })
          }
        />
        <TargetSelect
          label="Куда ведёт «иначе»"
          value={node.else?.next ?? ""}
          graph={graph}
          ownId={node.id}
          onChange={(target) => actions.connect({ kind: "else" }, target)}
        />
      </fieldset>
    </>
  );
}

function EndFields({ node, actions }: Pick<NodePropertiesProps, "node" | "actions">) {
  return (
    <>
      <TextArea
        label="Текст для обучающегося (prompt)"
        rows={3}
        maxLength={1000}
        value={node.prompt ?? ""}
        onChange={(event) => actions.update({ prompt: event.target.value })}
      />
      <div className={styles.grid2}>
        <TextInput
          label="Исход (outcome)"
          value={node.outcome ?? ""}
          onChange={(event) => actions.update({ outcome: event.target.value })}
        />
        <TextInput
          label="Баллы за завершение (0–100)"
          type="number"
          min={0}
          max={100}
          value={node.score ?? ""}
          onChange={(event) => {
            const value = toNumber(event.target.value);
            actions.update({
              score: value === undefined ? undefined : Math.max(0, Math.min(100, Math.round(value))),
            });
          }}
        />
      </div>
      <Checkbox
        label="Завершение считается зачётным (passed)"
        checked={node.passed ?? false}
        onChange={(event) => actions.update({ passed: event.target.checked })}
      />
    </>
  );
}

/** Панель свойств выбранного блока: поля зависят от вида блока; в режиме «только чтение» всё заблокировано. */
export function NodeProperties({ node, graph, readOnly, actions }: NodePropertiesProps) {
  return (
    <section className={styles.panel} aria-label={`Свойства блока ${node.id}`}>
      <h3 className={styles.panel__title}>{NODE_KIND_LABEL[node.type]}: свойства</h3>
      {readOnly ? <p className={styles.note}>Версия закрыта для правок — поля только для чтения.</p> : null}
      <fieldset className={styles.panel__lock} disabled={readOnly}>
        <IdField key={node.id} node={node} rename={actions.rename} />
        <TextInput
          label="Заголовок"
          maxLength={160}
          value={node.title ?? ""}
          onChange={(event) => actions.update({ title: event.target.value })}
        />
        {node.type === "action" ? <ActionFields node={node} graph={graph} actions={actions} /> : null}
        {node.type === "condition" ? <ConditionFields node={node} graph={graph} actions={actions} /> : null}
        {node.type === "end" ? <EndFields node={node} actions={actions} /> : null}
        <div className={styles.row}>
          <Btn onClick={actions.setStart} disabled={graph.start === node.id}>
            {graph.start === node.id ? "Этот блок — стартовый" : "Сделать стартовым"}
          </Btn>
          <Btn variant="danger" onClick={actions.requestDelete}>
            Удалить блок
          </Btn>
        </div>
      </fieldset>
    </section>
  );
}
