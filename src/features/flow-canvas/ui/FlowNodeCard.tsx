"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

import { FLOW_BLOCKS, isPill, nodeSize, outputsOf } from "@/entities/scenario-flow";
import type { FlowNode } from "@/entities/scenario-flow";
import { PfIcon } from "@/shared/ui/platform";

import styles from "./FlowCanvas.module.css";

export type NodeMark = "active" | "done" | "missed" | null;

type FlowNodeCardProps = {
  node: FlowNode;
  step: number;
  summary: string;
  selected: boolean;
  errors: number;
  warnings: number;
  mark: NodeMark;
  simplified: boolean;
  readOnly: boolean;
  /** Подключённые выходы — у свободных обязательных выходов точка красная. */
  connectedPorts: Set<string>;
  /** Подпись для экранного диктора: шаг, тип, настройки, куда ведут выходы, проблемы. */
  ariaLabel: string;
  /** Блок доступен по Tab: выделенный, а без выделения — первый шаг (roving tabindex). */
  tabbable: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onPortPointerDown: (event: PointerEvent<HTMLSpanElement>, port: string) => void;
};

export function FlowNodeCard({
  node,
  step,
  summary,
  selected,
  errors,
  warnings,
  mark,
  simplified,
  readOnly,
  connectedPorts,
  ariaLabel,
  tabbable,
  onPointerDown,
  onKeyDown,
  onFocus,
  onPortPointerDown,
}: FlowNodeCardProps) {
  const block = FLOW_BLOCKS[node.type];
  const { width, height } = nodeSize(node);
  const outputs = outputsOf(node);
  const style = {
    left: node.position.x,
    top: node.position.y,
    width,
    height,
    "--cat": `var(--pf-flow-cat-${block.group})`,
  } as CSSProperties;
  const className = [
    isPill(node) ? styles.pill : styles.node,
    selected ? styles["node--selected"] : "",
    errors ? styles["node--error"] : warnings ? styles["node--warning"] : "",
    mark ? styles[`node--${mark}`] : "",
    simplified ? styles["node--simplified"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  const ports = outputs.map((output) => (
    <span
      key={output.port}
      className={[styles.out, output.required ? "" : styles["out--optional"]].filter(Boolean).join(" ")}
    >
      {isPill(node) ? null : output.title}
      <span
        className={[
          styles.port,
          output.required && !connectedPorts.has(output.port) ? styles["port--open"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-flow-port={output.port}
        title={readOnly ? undefined : `Потяните, чтобы соединить «${output.title}» со следующим шагом`}
        onPointerDown={readOnly ? undefined : (event) => onPortPointerDown(event, output.port)}
      />
    </span>
  ));

  return (
    <div
      className={className}
      style={style}
      data-flow-node={node.id}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {block.hasInput ? (
        <span className={[styles.port, styles["port--in"]].join(" ")} aria-hidden="true" />
      ) : null}
      {errors ? (
        <span className={[styles.badge, styles["badge--error"]].join(" ")} aria-hidden="true">
          ⛔ {errors}
        </span>
      ) : warnings ? (
        <span className={[styles.badge, styles["badge--warning"]].join(" ")} aria-hidden="true">
          ⚠ {warnings}
        </span>
      ) : mark === "done" ? (
        <span className={[styles.badge, styles["badge--done"]].join(" ")} aria-hidden="true">
          ✓
        </span>
      ) : null}
      {isPill(node) ? (
        <>
          <span className={styles.pill__tile} aria-hidden="true">
            <PfIcon name={block.icon} />
          </span>
          <span className={styles.pill__title}>{node.title?.trim() || block.title}</span>
          <span className={styles.pill__outs}>{ports}</span>
        </>
      ) : (
        <>
          <div className={styles.node__head}>
            <span className={styles.tile} aria-hidden="true">
              <PfIcon name={block.icon} />
            </span>
            <span className={styles.node__type}>{node.title?.trim() || block.title}</span>
            <span className={styles.node__step} title={`Шаг ${step}`}>
              {step}
            </span>
          </div>
          {simplified ? null : <div className={styles.node__summary}>{summary}</div>}
          <div className={styles.node__outs}>{ports}</div>
        </>
      )}
    </div>
  );
}
