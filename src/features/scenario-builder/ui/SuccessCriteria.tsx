"use client";

import { useState } from "react";

import { ENTERED_FIELD_TITLES } from "@/entities/session";
import type { SuccessCriteria as SuccessCriteriaContract } from "@/shared/api";
import { Button, Chip, Input, Panel } from "@/shared/ui";

import styles from "./ScenarioEditor.module.css";

type SuccessCriteriaProps = {
  criteria: SuccessCriteriaContract;
  /** Сохранение через мок-слой (PATCH /api/mock/scenarios/[id]). */
  onSave: (criteria: SuccessCriteriaContract) => Promise<unknown>;
};

const MIN_GRAMMAR_ERRORS = 0;

/** 7. Критерии успешности (ТЗ §8): порог грамматических ошибок, обязательные поля, синтаксис ответов. */
export function SuccessCriteria({ criteria, onSave }: SuccessCriteriaProps) {
  const [maxGrammarErrors, setMaxGrammarErrors] = useState(String(criteria.maxGrammarErrors));
  const [syntaxRequirements, setSyntaxRequirements] = useState(criteria.syntaxRequirements);
  const [isBusy, setBusy] = useState(false);
  const threshold = Number(maxGrammarErrors);
  const error =
    Number.isInteger(threshold) && threshold >= MIN_GRAMMAR_ERRORS
      ? undefined
      : "Порог — целое число не меньше 0";
  return (
    <Panel
      title="7. Критерии успешности"
      headerTone="dark"
      actions={
        <Button
          variant="primary"
          size="sm"
          disabled={isBusy || Boolean(error)}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                maxGrammarErrors: threshold,
                requiredFields: criteria.requiredFields,
                syntaxRequirements,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {isBusy ? "Сохраняем…" : "Сохранить критерии"}
        </Button>
      }
    >
      <div className={styles.editor__form}>
        <Input
          label="Допустимо грамматических ошибок, не более"
          type="number"
          min={MIN_GRAMMAR_ERRORS}
          value={maxGrammarErrors}
          error={error}
          onChange={(event) => setMaxGrammarErrors(event.target.value)}
        />
        <div className={styles["editor__field--wide"]}>
          <span className={styles.editor__label}>Обязательные поля</span>
          <div className={styles.editor__chips}>
            {criteria.requiredFields.map((field) => (
              <Chip key={field} selected className={styles.editor__chip} title={field}>
                {ENTERED_FIELD_TITLES[field] ?? field}
              </Chip>
            ))}
          </div>
        </div>
        <label className={styles["editor__field--wide"]}>
          <span className={styles.editor__label}>Требования к синтаксису ответов</span>
          <textarea
            className={styles.editor__textarea}
            rows={2}
            value={syntaxRequirements}
            onChange={(event) => setSyntaxRequirements(event.target.value)}
          />
        </label>
      </div>
    </Panel>
  );
}
