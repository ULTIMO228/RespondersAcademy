"use client";

import { useState } from "react";

import type { ScenarioValidateAction } from "@/shared/api";
import { AiBadge, Button, Panel, StatusChip } from "@/shared/ui";
import type { SelectOption } from "@/shared/ui";

import { getValidationView } from "../config/dictionaries";
import { CorrectionForm } from "./CorrectionForm";
import { CorrectionList } from "./CorrectionList";

import styles from "./ScenarioEditor.module.css";

export type ValidationDecision = (
  action: ScenarioValidateAction,
  options?: { fields?: string[]; comment?: string },
) => Promise<unknown>;

type ValidationPanelProps = {
  /** Живое состояние Scenario.validation из мок-слоя. */
  status: string;
  comment?: string;
  approvedFields?: string[];
  reviewerName: string;
  etalonFields: SelectOption[];
  aiAssessment: { confidence: string; summary: string };
  onDecide: ValidationDecision;
  /** Повторная «генерация» исправленного варианта после коррекции (сценарий А шаг 7). */
  onRegenerate: () => Promise<unknown>;
  /** Сообщение результата последней операции (сохранено / ошибка). */
  notice?: { kind: "saved" | "error"; text: string } | null;
};

/** 5–6. Коррекция и валидация: решение преподавателя главнее мок-оценки системы (Q&A в3). */
export function ValidationPanel({
  status,
  comment,
  approvedFields,
  reviewerName,
  etalonFields,
  aiAssessment,
  onDecide,
  onRegenerate,
  notice,
}: ValidationPanelProps) {
  const [isPartialOpen, setPartialOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>(() => approvedFields ?? []);
  const [isBusy, setBusy] = useState(false);
  const view = getValidationView(status);
  const savedLabels = etalonFields.filter((field) => approvedFields?.includes(field.value));
  const partialSelection = selection.length > 0 ? selection : etalonFields.map((field) => field.value);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="5–6. Коррекция и валидация" headerTone="dark">
      <div className={styles.editor__decision}>
        <p className={styles.editor__status} data-status={status}>
          Решение преподавателя: <StatusChip label={view.title} tone={view.tone} />
          {approvedFields?.length ? (
            <span className={styles.editor__muted}>
              {" "}
              частично: {approvedFields.length} из {etalonFields.length} полей эталона
            </span>
          ) : null}
        </p>
        <div className={styles.editor__decisionButtons}>
          <Button
            variant="primary"
            size="lg"
            disabled={isBusy}
            onClick={() => run(() => onDecide("approve"))}
          >
            Утвердить полностью
          </Button>
          <Button variant="blue" size="lg" disabled={isBusy} onClick={() => setPartialOpen(true)}>
            Утвердить частично
          </Button>
          <Button variant="danger" size="lg" disabled={isBusy} onClick={() => run(() => onDecide("reject"))}>
            Отклонить
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={isBusy}
            onClick={() => run(() => onDecide("submit"))}
            title="Вернуть сценарий на проверку (статус «на проверке»)"
          >
            На проверку
          </Button>
        </div>
        {isPartialOpen ? (
          <fieldset className={styles.editor__partial}>
            <legend className={styles.editor__label}>Поля эталона для утверждения</legend>
            {etalonFields.map((field) => (
              <label key={field.value} className={styles.editor__checkbox}>
                <input
                  type="checkbox"
                  checked={partialSelection.includes(field.value)}
                  onChange={() =>
                    setSelection(
                      partialSelection.includes(field.value)
                        ? partialSelection.filter((id) => id !== field.value)
                        : [...partialSelection, field.value],
                    )
                  }
                />
                {field.label}
              </label>
            ))}
            <Button
              variant="primary"
              size="sm"
              disabled={isBusy || partialSelection.length === 0}
              onClick={() =>
                run(async () => {
                  await onDecide("approvePartial", { fields: partialSelection });
                  setPartialOpen(false);
                })
              }
            >
              Сохранить выбор
            </Button>
          </fieldset>
        ) : null}
        {savedLabels.length > 0 ? (
          <p className={styles.editor__saved} role="status">
            Сохранён выбор: {savedLabels.map((field) => field.label).join("; ")}
          </p>
        ) : null}
        {notice ? (
          <p
            className={styles.editor__saved}
            data-tone={notice.kind}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
      <p className={styles.editor__ai}>
        <AiBadge /> Оценка системы (мок): уверенность {aiAssessment.confidence}. {aiAssessment.summary}{" "}
        Итоговое решение — за преподавателем.
      </p>
      <CorrectionForm
        targets={etalonFields}
        disabled={isBusy}
        onSubmit={(targetLabel, text) =>
          run(async () => {
            await onDecide("submit", { comment: `${targetLabel}: ${text}` });
            await onRegenerate();
          })
        }
      />
      <CorrectionList comment={comment} author={reviewerName} />
    </Panel>
  );
}
