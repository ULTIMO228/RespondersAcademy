"use client";

import { forwardRef } from "react";
import type { CSSProperties } from "react";

import {
  edgeFromPort,
  FLOW_ACTION_KINDS,
  FLOW_BLOCKS,
  FLOW_STAGES,
  isFieldVisible,
  nodeById,
  outputsOf,
  stepNumbers,
  summarizeNode,
  wouldCreateCycle,
} from "@/entities/scenario-flow";
import type {
  FlowCardOption,
  FlowDictionaries,
  FlowFieldDef,
  FlowGraph,
  FlowIssue,
  FlowMode,
  FlowNode,
  FlowPropValue,
  FlowSelection,
  FlowSettings,
} from "@/entities/scenario-flow";
import { PfIcon, PlatformButton } from "@/shared/ui/platform";

import { Checkbox, CommitText, Select } from "./controls";
import styles from "./FlowInspector.module.css";

type FlowInspectorProps = {
  graph: FlowGraph;
  dict: FlowDictionaries;
  selection: FlowSelection;
  issues: FlowIssue[];
  onUpdateNode: (id: string, patch: { props?: Record<string, FlowPropValue>; title?: string }) => void;
  onConnect: (from: { node: string; port: string }, to: string) => void;
  onDisconnect: (from: { node: string; port: string }) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onUpdateGraph: (patch: { title?: string; mode?: FlowMode }) => void;
  onUpdateSettings: (patch: Partial<FlowSettings>) => void;
};

const MODE_OPTIONS = [
  { value: "operator112", label: "Специалист 112" },
  { value: "dds", label: "Диспетчер ДДС" },
];

/**
 * Правая панель свойств (design-concept.md §7): блок — его настройки, оценка и «Следующий шаг» для каждого выхода
 * (полная замена перетаскиванию связей); связь — откуда и куда; без выделения — свойства сценария.
 */
export const FlowInspector = forwardRef<HTMLElement, FlowInspectorProps>(function FlowInspector(props, ref) {
  const { graph, selection } = props;
  const node = selection?.kind === "node" ? nodeById(graph, selection.id) : undefined;
  const edge = selection?.kind === "edge" ? graph.edges.find((item) => item.id === selection.id) : undefined;
  return (
    <aside ref={ref} className={styles.inspector} aria-label="Свойства" tabIndex={-1}>
      {node ? (
        <NodeProperties {...props} node={node} />
      ) : edge ? (
        <EdgeProperties {...props} edgeId={edge.id} />
      ) : (
        <ScenarioProperties {...props} />
      )}
    </aside>
  );
});

function shorten(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** Что за ситуация в выбранном билете: суть, адрес, заявитель — целиком, без сокращений. */
function TicketDetails({ card }: { card: FlowCardOption }) {
  return (
    <div className={styles.ticket} aria-label={`О билете: ${card.label}`} role="group">
      <b>{card.label}</b>
      <p className={styles.ticket__text}>{card.summary}</p>
      <dl className={styles.ticket__facts}>
        <dt>Адрес</dt>
        <dd>{card.address || "не указан"}</dd>
        {card.callerName ? (
          <>
            <dt>Заявитель</dt>
            <dd>
              {card.callerName}
              {card.callerPhone ? `, ${card.callerPhone}` : ""}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function optionsFor(field: FlowFieldDef, node: FlowNode, graph: FlowGraph, dict: FlowDictionaries) {
  const source = field.options;
  if (!source) return [];
  if (source.kind === "static") {
    if (field.key === "what") return FLOW_ACTION_KINDS.filter((kind) => kind.modes.includes(graph.mode));
    return source.options;
  }
  if (source.kind === "dictionary") {
    // Номер билета ничего не говорит преподавателю — в списке рядом с ним суть ситуации (отзыв 2026-10-20).
    if (source.name === "cards")
      return dict.cards.map((card) => ({
        value: card.value,
        label: `${card.label} — ${shorten(card.summary, 70)}`,
      }));
    return dict[source.name];
  }
  const numbers = stepNumbers(graph);
  return graph.nodes
    .filter((item) => item.type === "requiredQuestion" && item.id !== node.id)
    .map((item) => ({
      value: item.id,
      label: `Шаг ${numbers.get(item.id)} · ${item.title?.trim() || summarizeNode(item, dict)}`,
    }));
}

function NodeProperties({
  graph,
  dict,
  node,
  issues,
  onUpdateNode,
  onConnect,
  onDisconnect,
  onDeleteNode,
  onDuplicateNode,
}: FlowInspectorProps & { node: FlowNode }) {
  const block = FLOW_BLOCKS[node.type];
  const numbers = stepNumbers(graph);
  const own = issues.filter((issue) => issue.nodeId === node.id);
  const setProp = (key: string, value: FlowPropValue) => onUpdateNode(node.id, { props: { [key]: value } });
  const fieldIssue = (field: FlowFieldDef) =>
    own.find(
      (issue) =>
        issue.message.includes(`«${field.label}»`) || (field.key === "deadlineSec" && issue.code === "W03"),
    );

  const renderField = (field: FlowFieldDef) => {
    if (!isFieldVisible(field, node)) return null;
    const value = node.props[field.key];
    const issue = fieldIssue(field);
    const tone = issue ? (issue.level === "error" ? "error" : "warning") : undefined;
    const hint = issue
      ? `${issue.level === "error" ? "⛔" : "⚠"} ${issue.message.replace(/^Шаг \d+ · [^:]+: /, "")}`
      : field.hint;
    if (field.control === "checkbox")
      return (
        <Checkbox
          key={field.key}
          label={field.label}
          checked={value === true}
          hint={field.hint}
          onChange={(checked) => setProp(field.key, checked)}
        />
      );
    if (field.control === "select" && field.key === "cardId") {
      const card = dict.cards.find((option) => option.value === value);
      return (
        <div key={field.key} className={styles.ticketField}>
          <Select
            label={field.label}
            value={value === undefined ? "" : String(value)}
            options={optionsFor(field, node, graph, dict)}
            tone={tone}
            hint={hint}
            onChange={(next) => setProp(field.key, next)}
          />
          {card ? <TicketDetails card={card} /> : null}
        </div>
      );
    }
    if (field.control === "select")
      return (
        <Select
          key={field.key}
          label={field.label}
          value={value === undefined ? "" : String(value)}
          options={optionsFor(field, node, graph, dict)}
          tone={tone}
          hint={hint}
          onChange={(next) => setProp(field.key, next)}
        />
      );
    if (field.control === "number")
      return (
        <CommitText
          key={`${node.id}-${field.key}`}
          label={field.label}
          type="number"
          min={field.min}
          max={field.max}
          value={value === undefined ? "" : String(value)}
          tone={tone}
          hint={hint}
          onCommit={(next) => {
            const number = Number(next);
            if (!Number.isFinite(number)) return;
            setProp(
              field.key,
              Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Math.round(number))),
            );
          }}
        />
      );
    return (
      <CommitText
        key={`${node.id}-${field.key}`}
        label={field.label}
        multiline={field.control === "textarea"}
        value={value === undefined ? "" : String(value)}
        tone={tone}
        hint={hint}
        onCommit={(next) => setProp(field.key, next)}
      />
    );
  };

  const scoring = block.fields.filter((field) => ["points", "critical"].includes(field.key));
  const settings = block.fields.filter((field) => !["points", "critical"].includes(field.key));
  const outputs = outputsOf(node);
  const targets = graph.nodes.filter((item) => item.id !== node.id && FLOW_BLOCKS[item.type].hasInput);

  return (
    <>
      <div className={styles.head}>
        <div
          className={styles.title}
          style={{ "--cat": `var(--pf-flow-cat-${block.group})` } as CSSProperties}
        >
          <span className={styles.tile} aria-hidden="true">
            <PfIcon name={block.icon} />
          </span>
          <h2 className={styles.title__text}>{block.title}</h2>
          <span className={styles.step}>Шаг № {numbers.get(node.id)}</span>
        </div>
        <p className={styles.about}>{block.description}.</p>
      </div>
      <div className={styles.body}>
        {own.some(
          (issue) => issue.level === "error" && !block.fields.some((field) => fieldIssue(field) === issue),
        ) ? (
          <ul className={styles.issues} aria-label="Ошибки шага">
            {own
              .filter((issue) => !block.fields.some((field) => fieldIssue(field) === issue))
              .map((issue) => (
                <li
                  key={`${issue.code}-${issue.port ?? ""}-${issue.message}`}
                  className={issue.level === "error" ? styles["issue--error"] : styles["issue--warning"]}
                >
                  {issue.level === "error" ? "⛔" : "⚠"} {issue.message.replace(/^Шаг \d+ · [^:]+: /, "")}
                </li>
              ))}
          </ul>
        ) : null}
        {node.type === "start" ? (
          <p className={styles.about}>
            Общие нормативы и описание — в свойствах сценария: снимите выделение (Esc).
          </p>
        ) : (
          <CommitText
            key={`${node.id}-title`}
            label="Название шага"
            value={node.title ?? ""}
            hint="Необязательно: видно на схеме вместо названия блока"
            onCommit={(title) => onUpdateNode(node.id, { title })}
          />
        )}
        {settings.map(renderField)}
        {scoring.length ? (
          <section className={styles.section} aria-label="Оценка">
            <h3 className={styles.section__title}>Оценка</h3>
            {scoring.map(renderField)}
            {block.scoring !== "none" ? (
              <Select
                label="Этап для карты ошибок"
                value={String(node.props.stage ?? "")}
                placeholder="По умолчанию"
                options={FLOW_STAGES[graph.mode]}
                onChange={(stage) => setProp("stage", stage)}
              />
            ) : null}
          </section>
        ) : null}
        {outputs.length ? (
          <section className={styles.section} aria-label="Следующий шаг">
            <h3 className={styles.section__title}>Следующий шаг</h3>
            {outputs.map((output) => {
              const current = edgeFromPort(graph, node.id, output.port);
              return (
                <Select
                  key={output.port}
                  compactLabel
                  label={output.required ? output.title : `${output.title} (необязательно)`}
                  value={current?.to.node ?? ""}
                  placeholder={output.required ? "— не указан —" : "Как основной выход"}
                  tone={output.required && !current ? "error" : undefined}
                  options={targets.map((target) => ({
                    value: target.id,
                    label: `№ ${numbers.get(target.id)} · ${target.title?.trim() || FLOW_BLOCKS[target.type].title}`,
                    disabled: target.id !== current?.to.node && wouldCreateCycle(graph, node.id, target.id),
                  }))}
                  onChange={(to) =>
                    to
                      ? onConnect({ node: node.id, port: output.port }, to)
                      : onDisconnect({ node: node.id, port: output.port })
                  }
                />
              );
            })}
            <p className={styles.hint}>Шаги, которые замкнули бы круг, в списке недоступны.</p>
          </section>
        ) : null}
        {node.type === "start" ? null : (
          <div className={styles.actions}>
            <PlatformButton className={styles.button} onClick={() => onDuplicateNode(node.id)}>
              <PfIcon name="copy" /> Дублировать
            </PlatformButton>
            <PlatformButton
              className={[styles.button, styles["button--danger"]].join(" ")}
              onClick={() => onDeleteNode(node.id)}
            >
              <PfIcon name="trash" /> Удалить шаг
            </PlatformButton>
          </div>
        )}
      </div>
    </>
  );
}

function EdgeProperties({ graph, dict, edgeId, onDeleteEdge }: FlowInspectorProps & { edgeId: string }) {
  const edge = graph.edges.find((item) => item.id === edgeId)!;
  const numbers = stepNumbers(graph);
  const from = nodeById(graph, edge.from.node);
  const to = nodeById(graph, edge.to.node);
  const port = from
    ? outputsOf(from).find((output) => output.port === edge.from.port)?.title
    : edge.from.port;
  const name = (node: FlowNode | undefined) =>
    node
      ? `Шаг ${numbers.get(node.id)} · ${node.title?.trim() || summarizeNode(node, dict)}`
      : "удалённый шаг";
  return (
    <>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={[styles.tile, styles["tile--edge"]].join(" ")} aria-hidden="true">
            <PfIcon name="arrow" />
          </span>
          <h2 className={styles.title__text}>Связь</h2>
        </div>
        <p className={styles.about}>Куда переходит сценарий после шага.</p>
      </div>
      <div className={styles.body}>
        <dl className={styles.facts}>
          <dt>Откуда</dt>
          <dd>{name(from)}</dd>
          <dt>Выход</dt>
          <dd>«{port}»</dd>
          <dt>Куда</dt>
          <dd>{name(to)}</dd>
        </dl>
        <div className={styles.actions}>
          <PlatformButton
            className={[styles.button, styles["button--danger"]].join(" ")}
            onClick={() => onDeleteEdge(edge.id)}
          >
            <PfIcon name="trash" /> Удалить связь
          </PlatformButton>
        </div>
      </div>
    </>
  );
}

function ScenarioProperties({ graph, onUpdateGraph, onUpdateSettings }: FlowInspectorProps) {
  const settings = graph.settings;
  const number = (key: keyof FlowSettings, min: number, max: number) => (value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      onUpdateSettings({ [key]: Math.min(max, Math.max(min, Math.round(parsed))) });
  };
  return (
    <>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={[styles.tile, styles["tile--edge"]].join(" ")} aria-hidden="true">
            <PfIcon name="flow" />
          </span>
          <h2 className={styles.title__text}>Сценарий</h2>
        </div>
        <p className={styles.about}>
          Ничего не выбрано — здесь общие свойства. Выберите блок на схеме, чтобы настроить его.
        </p>
      </div>
      <div className={styles.body}>
        <CommitText
          label="Название сценария"
          value={graph.title}
          onCommit={(title) => onUpdateGraph({ title })}
        />
        <Select
          label="Режим тренажёра"
          value={graph.mode}
          options={MODE_OPTIONS}
          hint="От режима зависят доступные действия: статусы и звонки — в ДДС, оповещение служб и признаки — в 112"
          onChange={(mode) =>
            mode === "dds" || mode === "operator112" ? onUpdateGraph({ mode }) : undefined
          }
        />
        <CommitText
          label="Описание для студента"
          multiline
          value={settings.description}
          onCommit={(description) => onUpdateSettings({ description })}
        />
        <section className={styles.section} aria-label="Нормативы и оценка">
          <h3 className={styles.section__title}>Нормативы и оценка</h3>
          <CommitText
            label="Норматив реакции, секунд"
            type="number"
            min={1}
            max={600}
            value={String(settings.primaryReactionSec)}
            onCommit={number("primaryReactionSec", 1, 600)}
          />
          <CommitText
            label="Норматив отработки, секунд"
            type="number"
            min={1}
            max={3600}
            value={String(settings.fullProcessingSec)}
            onCommit={number("fullProcessingSec", 1, 3600)}
          />
          <CommitText
            label="Проходной балл, из 100"
            type="number"
            min={0}
            max={100}
            value={String(settings.passThreshold)}
            onCommit={number("passThreshold", 0, 100)}
          />
          <CommitText
            label="Зачёт при опоздании, %"
            type="number"
            min={0}
            max={100}
            value={String(settings.lateCreditPercent)}
            hint="Какая доля баллов остаётся, если действие сделано позже срока"
            onCommit={number("lateCreditPercent", 0, 100)}
          />
        </section>
      </div>
    </>
  );
}
