"use client";

import { useState } from "react";

import { Button, Select } from "@/shared/ui";
import type { SelectOption } from "@/shared/ui";

import styles from "./ScenarioEditor.module.css";

type CorrectionFormProps = {
  targets: SelectOption[];
  disabled?: boolean;
  onSubmit: (targetLabel: string, comment: string) => void;
};

/** 5. Коррекция: контекстный комментарий к вопросу/ответу — уходит в Scenario.validation.comment. */
export function CorrectionForm({ targets, disabled = false, onSubmit }: CorrectionFormProps) {
  const [targetId, setTargetId] = useState(targets[0]?.value ?? "");
  const [comment, setComment] = useState("");
  const targetLabel = targets.find((target) => target.value === targetId)?.label ?? "";
  return (
    <div className={styles.editor__correction}>
      <Select
        label="Комментарий к вопросу / ответу"
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        options={targets}
      />
      <label className={styles.editor__commentField}>
        <span className={styles.editor__label}>Текст комментария</span>
        <textarea
          className={styles.editor__textarea}
          rows={2}
          value={comment}
          placeholder="Например: для ДТП с утечкой топлива 101 обязателен даже без возгорания"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        disabled={disabled || !comment.trim()}
        onClick={() => {
          onSubmit(targetLabel, comment.trim());
          setComment("");
        }}
      >
        Отправить на доработку
      </Button>
    </div>
  );
}
