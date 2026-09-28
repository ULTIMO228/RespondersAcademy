"use client";

import { useState } from "react";

import type { GrammarError } from "@/shared/api";
import { AiBadge } from "@/shared/ui";

import type { ScenarioEditorApi } from "../api/editorApi";

import styles from "./AIScenarioWorkflowPanel.module.css";

type ScenarioTextCheckProps = {
  api: Pick<ScenarioEditorApi, "checkGrammar">;
  scenarioId: string;
  version: number;
  /** Путь поля карточки (`summary`) — уходит в запрос и возвращается в замечаниях. */
  fieldPath: string;
  fieldTitle: string;
  /** Текущий текст поля в форме преподавателя; проверка его не изменяет. */
  text: string;
};

type CheckResult = { text: string; version: number; issues: GrammarError[] };

const TYPE_TITLES: Record<string, string> = { spelling: "орфография", syntax: "синтаксис" };

/**
 * US3 (T055): принудительная проверка ручного текста версии до утверждения. Замечания привязаны к полю,
 * фрагменту и версии; текст не исправляется автоматически. Правка текста или новая версия делают результат
 * устаревшим — преподаватель запускает проверку повторно.
 */
export function ScenarioTextCheck({
  api,
  scenarioId,
  version,
  fieldPath,
  fieldTitle,
  text,
}: ScenarioTextCheckProps) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const response = await api.checkGrammar(text, fieldPath, { scenarioId, scenarioVersion: version });
      setResult({ text, version, issues: response.data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось проверить текст");
    } finally {
      setChecking(false);
    }
  };

  const stale = result !== null && (result.text !== text || result.version !== version);
  return (
    <section className={styles.textCheck} aria-label={`Проверка текста: ${fieldTitle}`}>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={checking || !text.trim()}
          onClick={() => void handleCheck()}
        >
          {checking ? "Проверяем…" : result ? "Проверить повторно" : "Проверить текст"}
        </button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div>
          {stale ? (
            <p className={styles.meta} role="status">
              {result.version !== version
                ? `Результат относится к версии ${result.version} — проверьте текст версии ${version} повторно`
                : "Текст изменён после проверки — проверьте повторно"}
            </p>
          ) : null}
          <p className={styles.meta}>
            <AiBadge title="Проверка локальными словарями без генеративной модели" /> {fieldTitle}, версия{" "}
            {result.version}: замечаний {result.issues.length}
          </p>
          {result.issues.length ? (
            <ul className={styles.decisionList} aria-label="Замечания к тексту">
              {result.issues.map((issue, index) => (
                <li
                  key={`${issue.field}-${issue.wrong}-${index}`}
                  className={stale ? styles.stale : undefined}
                >
                  {issue.field}: «{issue.wrong}» → «{issue.expected}» —{" "}
                  {TYPE_TITLES[issue.type] ?? issue.type}
                  {issue.fragment !== issue.wrong ? ` · фрагмент «${issue.fragment}»` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.success}>Замечаний к тексту нет</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
