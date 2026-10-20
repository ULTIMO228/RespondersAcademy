"use client";

import { useState } from "react";

import type { GraphFactScalar, GraphInput } from "@/shared/api";

import { formatScalar, parseScalar } from "../lib/predicate";
import { Btn, Checkbox, TextInput } from "./controls";

import styles from "./Properties.module.css";

const MAX_SETS = 16;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;

type SetsEditorProps = {
  sets: Record<string, GraphFactScalar> | undefined;
  onChange: (sets: Record<string, GraphFactScalar> | undefined) => void;
};

/** Факты, которые шаг задаёт сам (sets): пары «факт — значение», до 16 штук. */
export function SetsEditor({ sets, onChange }: SetsEditorProps) {
  const [rows, setRows] = useState<[string, string][]>(
    Object.entries(sets ?? {}).map(([key, value]) => [key, formatScalar(value)]),
  );
  const commit = (next: [string, string][]) => {
    setRows(next);
    const entries = next
      .filter(([key]) => key.trim() !== "")
      .map(([key, value]) => [key.trim(), parseScalar(value)] as const);
    onChange(entries.length > 0 ? Object.fromEntries(entries) : undefined);
  };
  return (
    <fieldset className={styles.branch}>
      <legend>Факты, которые задаёт шаг (sets)</legend>
      {rows.map(([key, value], index) => (
        <div key={index} className={styles.pair}>
          <TextInput
            label={`Факт ${index + 1}`}
            value={key}
            onChange={(event) =>
              commit(rows.map((row, i) => (i === index ? [event.target.value, row[1]] : row)))
            }
          />
          <TextInput
            label={`Значение факта ${index + 1}`}
            value={value}
            onChange={(event) =>
              commit(rows.map((row, i) => (i === index ? [row[0], event.target.value] : row)))
            }
          />
          <Btn
            variant="danger"
            onClick={() => commit(rows.filter((_, i) => i !== index))}
            aria-label={`Удалить факт ${index + 1}`}
          >
            Удалить
          </Btn>
        </div>
      ))}
      <div>
        <Btn onClick={() => commit([...rows, ["", ""]])} disabled={rows.length >= MAX_SETS}>
          Добавить факт
        </Btn>
      </div>
    </fieldset>
  );
}

type InputEditorProps = {
  input: GraphInput | undefined;
  onChange: (input: GraphInput | undefined) => void;
};

/** Выбор обучающегося из объявленных вариантов (input): факт и 2–12 вариантов value/label/penalty. */
export function InputEditor({ input, onChange }: InputEditorProps) {
  if (!input) {
    return (
      <Checkbox
        label="Обучающийся выбирает вариант ответа (input)"
        checked={false}
        onChange={() =>
          onChange({
            fact: "",
            options: [
              { value: "", label: "" },
              { value: "", label: "" },
            ],
          })
        }
      />
    );
  }
  const setOption = (index: number, patch: Partial<GraphInput["options"][number]>) =>
    onChange({
      ...input,
      options: input.options.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    });
  return (
    <fieldset className={styles.branch}>
      <legend>Выбор обучающегося (input)</legend>
      <TextInput
        label="Факт, который задаёт выбор"
        value={input.fact}
        onChange={(event) => onChange({ ...input, fact: event.target.value })}
      />
      {input.options.map((option, index) => (
        <div key={index} className={styles.pair}>
          <TextInput
            label={`Значение варианта ${index + 1}`}
            value={option.value}
            onChange={(event) => setOption(index, { value: event.target.value })}
          />
          <TextInput
            label={`Подпись варианта ${index + 1}`}
            value={option.label}
            maxLength={160}
            onChange={(event) => setOption(index, { label: event.target.value })}
          />
          <TextInput
            label={`Штраф варианта ${index + 1} (0–100)`}
            type="number"
            min={0}
            max={100}
            value={option.penalty ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              setOption(index, {
                penalty: raw === "" ? undefined : Math.max(0, Math.min(100, Math.round(Number(raw)))),
              });
            }}
          />
          <Btn
            variant="danger"
            disabled={input.options.length <= MIN_OPTIONS}
            onClick={() => onChange({ ...input, options: input.options.filter((_, i) => i !== index) })}
            aria-label={`Удалить вариант ${index + 1}`}
          >
            Удалить
          </Btn>
        </div>
      ))}
      <div className={styles.row}>
        <Btn
          disabled={input.options.length >= MAX_OPTIONS}
          onClick={() => onChange({ ...input, options: [...input.options, { value: "", label: "" }] })}
        >
          Добавить вариант
        </Btn>
        <Btn onClick={() => onChange(undefined)}>Убрать выбор</Btn>
      </div>
    </fieldset>
  );
}
