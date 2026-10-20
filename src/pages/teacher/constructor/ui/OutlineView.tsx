"use client";

import type { ReactNode } from "react";

import { FLOW_BLOCKS, outputsOf, startNode, stepNumbers, summarizeNode } from "@/entities/scenario-flow";
import type { FlowDictionaries, FlowGraph, FlowIssue, FlowSelection } from "@/entities/scenario-flow";

import styles from "./ConstructorScreen.module.css";

type OutlineViewProps = {
  graph: FlowGraph;
  dict: FlowDictionaries;
  selection: FlowSelection;
  issues: FlowIssue[];
  hideAnswers?: boolean;
  onSelect: (nodeId: string) => void;
};

/**
 * Вид «Список шагов» (design-concept.md §3, §12): та же схема текстом — ветки с отступом, сход веток ссылкой
 * «→ к шагу N». Альтернатива схеме для клавиатуры и экранного диктора; правка — в панели свойств.
 */
export function OutlineView({
  graph,
  dict,
  selection,
  issues,
  hideAnswers = false,
  onSelect,
}: OutlineViewProps) {
  const numbers = stepNumbers(graph);
  const visited = new Set<string>();
  const items: ReactNode[] = [];

  const add = (id: string, depth: number) => {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    if (visited.has(id)) {
      items.push(
        <li
          key={`ref-${id}-${items.length}`}
          className={styles.outline__ref}
          style={{ marginLeft: depth * 40 }}
        >
          → к шагу {numbers.get(id)}
        </li>,
      );
      return;
    }
    visited.add(id);
    const own = issues.filter((issue) => issue.nodeId === id);
    const errors = own.filter((issue) => issue.level === "error").length;
    items.push(
      <li key={id} style={{ marginLeft: depth * 40 }}>
        <button
          type="button"
          className={[styles.outline__item, errors ? styles["outline__item--error"] : ""]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={selection?.kind === "node" && selection.id === id}
          onClick={() => onSelect(id)}
        >
          <span className={styles.outline__num}>Шаг {numbers.get(id)}</span>{" "}
          <b>{node.title?.trim() || FLOW_BLOCKS[node.type].title}</b>{" "}
          <span className={styles.outline__summary}>
            · {summarizeNode(node, dict, new Map(), { hideAnswers })}
          </span>{" "}
          {own.length ? (
            <span className={errors ? styles["count--error"] : styles["count--warning"]}>
              {errors ? `ошибок: ${errors}` : `предупреждений: ${own.length}`}
            </span>
          ) : null}
        </button>
      </li>,
    );
    const outputs = outputsOf(node);
    const connected = outputs.map((output) => ({
      output,
      edge: graph.edges.find((edge) => edge.from.node === id && edge.from.port === output.port),
    }));
    if (outputs.length === 1) {
      if (connected[0].edge) add(connected[0].edge.to.node, depth);
      return;
    }
    for (const { output, edge } of connected) {
      items.push(
        <li
          key={`branch-${id}-${output.port}`}
          className={styles.outline__branch}
          style={{ marginLeft: (depth + 1) * 40 }}
        >
          Если «{output.title}»:
          {edge ? null : output.required ? " следующий шаг не указан" : " как основной выход"}
        </li>,
      );
      if (edge) add(edge.to.node, depth + 1);
    }
  };

  const start = startNode(graph);
  if (start) add(start.id, 0);
  const orphans = graph.nodes.filter((node) => !visited.has(node.id));
  if (orphans.length) {
    items.push(
      <li key="orphans" className={styles.outline__branch}>
        Не связаны со схемой:
      </li>,
    );
    for (const node of orphans) add(node.id, 1);
  }

  return (
    <section className={styles.outline} aria-label="Список шагов">
      <ol className={styles.outline__list}>{items}</ol>
    </section>
  );
}
