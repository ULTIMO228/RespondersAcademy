"use client";

import type { GraphDecoy } from "@/shared/api";

import type { EditorGraph } from "../lib/model";
import { Btn, Select, TextInput } from "./controls";

import styles from "./Properties.module.css";

const MAX_DECOYS = 20;

type GraphSettingsProps = {
  graph: EditorGraph;
  readOnly: boolean;
  onChange: (patch: Partial<EditorGraph>) => void;
};

function numberOrUndefined(raw: string, min: number, max: number): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : undefined;
}

/** Общие настройки графа: стартовый блок, лишние кнопки (decoys) и правила начисления баллов (scoring). */
export function GraphSettings({ graph, readOnly, onChange }: GraphSettingsProps) {
  const setDecoy = (index: number, patch: Partial<GraphDecoy>) =>
    onChange({ decoys: graph.decoys.map((decoy, i) => (i === index ? { ...decoy, ...patch } : decoy)) });
  return (
    <section className={styles.panel} aria-label="Общие настройки графа">
      <h3 className={styles.panel__title}>Общие настройки графа</h3>
      <fieldset className={styles.panel__lock} disabled={readOnly}>
        <Select
          label="Стартовый блок"
          value={graph.start}
          onChange={(event) => onChange({ start: event.target.value })}
        >
          <option value="">— не выбран —</option>
          {graph.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.id}
              {node.title ? ` — ${node.title}` : ""}
            </option>
          ))}
        </Select>
        <div className={styles.grid2}>
          <TextInput
            label="Штраф за неверное действие (0–50)"
            type="number"
            min={0}
            max={50}
            placeholder="5 (по умолчанию)"
            value={graph.scoring.wrongActionPenalty ?? ""}
            onChange={(event) =>
              onChange({
                scoring: {
                  ...graph.scoring,
                  wrongActionPenalty: numberOrUndefined(event.target.value, 0, 50),
                },
              })
            }
          />
          <TextInput
            label="Проходной балл (0–100)"
            type="number"
            min={0}
            max={100}
            placeholder="60 (по умолчанию)"
            value={graph.scoring.passScore ?? ""}
            onChange={(event) =>
              onChange({
                scoring: { ...graph.scoring, passScore: numberOrUndefined(event.target.value, 0, 100) },
              })
            }
          />
        </div>
        <fieldset className={styles.branch}>
          <legend>Лишние кнопки (decoys)</legend>
          <p className={styles.note}>
            Неверные варианты действий, которые видит обучающийся рядом с настоящими.
          </p>
          {graph.decoys.map((decoy, index) => (
            <div key={index} className={styles.pair}>
              <TextInput
                label={`Код лишнего действия ${index + 1}`}
                value={decoy.action}
                onChange={(event) => setDecoy(index, { action: event.target.value })}
              />
              <TextInput
                label={`Подпись лишней кнопки ${index + 1}`}
                value={decoy.label}
                maxLength={160}
                onChange={(event) => setDecoy(index, { label: event.target.value })}
              />
              <span />
              <Btn
                variant="danger"
                onClick={() => onChange({ decoys: graph.decoys.filter((_, i) => i !== index) })}
                aria-label={`Удалить лишнюю кнопку ${index + 1}`}
              >
                Удалить
              </Btn>
            </div>
          ))}
          <div>
            <Btn
              disabled={graph.decoys.length >= MAX_DECOYS}
              onClick={() => onChange({ decoys: [...graph.decoys, { action: "", label: "" }] })}
            >
              Добавить лишнюю кнопку
            </Btn>
          </div>
        </fieldset>
      </fieldset>
    </section>
  );
}
