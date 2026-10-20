"use client";

import type { LocalCheck } from "../lib/model";
import type { ValidationState } from "../model/useGraphEditor";
import { Btn } from "./controls";

import styles from "./Editor.module.css";

type ValidationListProps = {
  local: LocalCheck[];
  validation: ValidationState;
  onPick: (nodeId: string) => void;
  onCheck: () => void;
};

/** Список ошибок под холстом: локальные дешёвые проверки + ответ сервера; клик по ошибке выбирает блок. */
export function ValidationList({ local, validation, onPick, onCheck }: ValidationListProps) {
  const server = validation.status === "done" ? validation.errors : [];
  const seen = new Set(local.map((item) => item.message));
  const all = [...local, ...server.filter((item) => !seen.has(item.message))];
  const validOnServer = validation.status === "done" && validation.valid && all.length === 0;
  return (
    <section className={styles.validation} aria-label="Проверка графа">
      <div className={styles.validation__head}>
        <h3 className={styles.validation__title}>Проверка графа</h3>
        <Btn onClick={onCheck} disabled={validation.status === "checking"}>
          Проверить на сервере
        </Btn>
      </div>
      {validation.status === "checking" ? <p role="status">Идёт проверка графа…</p> : null}
      {validation.status === "failed" ? (
        <p role="alert" className={styles.error}>
          Проверка не выполнена: {validation.message}
        </p>
      ) : null}
      {validOnServer ? (
        <p role="status" className={styles.ok}>
          ✔ Сервер не нашёл ошибок в графе.
        </p>
      ) : null}
      {all.length > 0 ? (
        <ul className={styles.errors} aria-label="Ошибки графа">
          {all.map((item, index) => (
            <li key={`${item.nodeId ?? "graph"}-${index}`}>
              {item.nodeId ? (
                <button
                  type="button"
                  className={styles.errors__link}
                  onClick={() => onPick(item.nodeId as string)}
                >
                  <span aria-hidden="true">⚠ </span>
                  Ошибка в блоке {item.nodeId}: {item.message}
                </button>
              ) : (
                <span className={styles.errors__plain}>
                  <span aria-hidden="true">⚠ </span>
                  Ошибка графа: {item.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.status === "idle" && all.length === 0 ? (
        <p className={styles.muted}>
          Проверка выполняется автоматически после правок; можно запустить вручную.
        </p>
      ) : null}
    </section>
  );
}
