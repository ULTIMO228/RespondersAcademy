"use client";

import { useState } from "react";

import type { GraphLeafPredicate, GraphPredicate, GraphPredicateOp } from "@/shared/api";

import {
  changeLeafOp,
  emptyLeaf,
  leafValueFromText,
  leafValueToText,
  predicateKind,
  PREDICATE_OPS,
  unwrapPredicate,
  wrapPredicate,
} from "../lib/predicate";
import { Btn, Select, TextInput } from "./controls";

import styles from "./Properties.module.css";

const MAX_DEPTH = 4;

type PredicateEditorProps = {
  predicate: GraphPredicate;
  onChange: (predicate: GraphPredicate) => void;
  depth?: number;
};

function Leaf({
  leaf,
  onChange,
  depth,
  onWrap,
}: {
  leaf: GraphLeafPredicate;
  onChange: (leaf: GraphLeafPredicate) => void;
  depth: number;
  onWrap: PredicateEditorProps["onChange"];
}) {
  const [raw, setRaw] = useState(leafValueToText(leaf));
  const changeOp = (op: GraphPredicateOp) => {
    const next = changeLeafOp(leaf, op);
    setRaw(leafValueToText(next));
    onChange(next);
  };
  return (
    <div className={styles.leaf}>
      <TextInput
        label="Факт"
        value={leaf.fact}
        onChange={(event) => onChange({ ...leaf, fact: event.target.value })}
      />
      <Select
        label="Операция"
        value={leaf.op}
        onChange={(event) => changeOp(event.target.value as GraphPredicateOp)}
      >
        {PREDICATE_OPS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </Select>
      {leaf.op === "exists" ? null : (
        <TextInput
          label="Значение"
          hint={leaf.op === "in" ? "Список через запятую" : undefined}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            onChange({ ...leaf, value: leafValueFromText(leaf.op, event.target.value) });
          }}
        />
      )}
      {depth < MAX_DEPTH ? (
        <div className={styles.row} role="group" aria-label="Объединить условие">
          <Btn onClick={() => onWrap(wrapPredicate(leaf, "all"))}>И (все)</Btn>
          <Btn onClick={() => onWrap(wrapPredicate(leaf, "any"))}>ИЛИ (любое)</Btn>
          <Btn onClick={() => onWrap(wrapPredicate(leaf, "not"))}>НЕ</Btn>
        </div>
      ) : null}
    </div>
  );
}

/** Рекурсивный редактор предиката ветки: лист (факт, операция, значение) и обёртки all / any / not. */
export function PredicateEditor({ predicate, onChange, depth = 0 }: PredicateEditorProps) {
  const kind = predicateKind(predicate);
  if (kind === "leaf") {
    return (
      <Leaf leaf={predicate as GraphLeafPredicate} onChange={onChange} depth={depth} onWrap={onChange} />
    );
  }
  if (kind === "not" && "not" in predicate) {
    return (
      <fieldset className={styles.group}>
        <legend>НЕ — отрицание условия</legend>
        <PredicateEditor
          predicate={predicate.not}
          onChange={(inner) => onChange({ not: inner })}
          depth={depth + 1}
        />
        <Btn onClick={() => onChange(unwrapPredicate(predicate))}>Убрать «НЕ»</Btn>
      </fieldset>
    );
  }
  const items = "all" in predicate ? predicate.all : "any" in predicate ? predicate.any : [];
  const wrap = (children: GraphPredicate[]): GraphPredicate =>
    "all" in predicate ? { all: children } : { any: children };
  return (
    <fieldset className={styles.group}>
      <legend>
        {kind === "all" ? "И — должны выполняться все условия" : "ИЛИ — достаточно любого условия"}
      </legend>
      {items.map((child, index) => (
        <div key={index} className={styles.group__item}>
          <PredicateEditor
            predicate={child}
            depth={depth + 1}
            onChange={(next) => onChange(wrap(items.map((item, i) => (i === index ? next : item))))}
          />
          {items.length > 1 ? (
            <Btn variant="danger" onClick={() => onChange(wrap(items.filter((_, i) => i !== index)))}>
              Удалить условие {index + 1}
            </Btn>
          ) : null}
        </div>
      ))}
      <div className={styles.row}>
        <Btn onClick={() => onChange(wrap([...items, emptyLeaf()]))}>Добавить условие</Btn>
        <Btn onClick={() => onChange(unwrapPredicate(predicate))}>Снять группу</Btn>
      </div>
    </fieldset>
  );
}
