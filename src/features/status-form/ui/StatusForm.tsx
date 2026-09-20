"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";

import { CLOSING_WARNING, SUBMIT_FALLBACK_ERROR } from "../config/texts";
import { canSubmitStatus } from "../model/statusOptions";
import type { StatusFormValues, StatusOption } from "../model/types";
import { useDialogFocus } from "../model/useDialogFocus";
import { useEscapeKey } from "../model/useEscapeKey";
import { useStatusForm } from "../model/useStatusForm";
import { ClosingConfirm } from "./ClosingConfirm";
import { FormIcon } from "./FormIcon";
import { StatusSelect } from "./StatusSelect";

import styles from "./StatusForm.module.css";

type StatusFormProps = {
  options: StatusOption[];
  /** Сохранение статуса; отклонённый Promise — ошибка показывается в форме, форма не закрывается. */
  onSubmit: (values: StatusFormValues) => void | Promise<void>;
  onCancel: () => void;
  initialDutyNumber?: string;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : SUBMIT_FALLBACK_ERROR;
}

/** Строка смены статуса реагирования поверх затемнения (ДДС_image8–20): Статус / Номер наряда / Комментарий / ✓ ✕. */
export function StatusForm({ options, onSubmit, onCancel, initialDutyNumber }: StatusFormProps) {
  const { values, setField } = useStatusForm(initialDutyNumber);
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [isConfirming, setConfirming] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const selected = options.find((option) => option.status === values.status);
  const isCommentRequired = Boolean(selected?.requiresComment);
  const canSubmit = canSubmitStatus(values, options) && !isSubmitting;
  const dialogFocus = useDialogFocus<HTMLFormElement>();

  const handleEscape = useCallback(() => {
    if (isDropdownOpen) setDropdownOpen(false);
    else if (isConfirming) setConfirming(false);
    else onCancel();
  }, [isDropdownOpen, isConfirming, onCancel]);
  useEscapeKey(handleEscape);

  function handleSelect(status: string) {
    setField("status", status);
    setDropdownOpen(false);
    setSubmitError(null);
  }

  async function save() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setSubmitError(toErrorMessage(error));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    if (selected?.isFinal && !isConfirming) setConfirming(true);
    else void save();
  }

  return (
    <form
      ref={dialogFocus.ref}
      className={styles.form}
      onSubmit={handleSubmit}
      onKeyDown={dialogFocus.onKeyDown}
      aria-label="Смена статуса реагирования"
    >
      <div className={styles.form__row}>
        <StatusSelect
          options={options}
          value={values.status}
          isOpen={isDropdownOpen}
          onToggle={() => setDropdownOpen((isOpen) => !isOpen)}
          onSelect={handleSelect}
        />
        <input
          className={styles.form__input}
          aria-label="Номер наряда"
          placeholder="Номер наряда"
          value={values.dutyNumber}
          onChange={(event) => setField("dutyNumber", event.target.value)}
        />
        <input
          className={[styles.form__input, isCommentRequired ? styles["form__input--required"] : ""].join(" ")}
          aria-label="Комментарий"
          aria-required={isCommentRequired}
          placeholder={isCommentRequired ? "Комментарий (обязательно)" : "Комментарий"}
          value={values.comment}
          onChange={(event) => setField("comment", event.target.value)}
        />
        <button
          type="submit"
          className={styles.form__button}
          disabled={!canSubmit || isConfirming}
          aria-label="Сохранить статус (Enter)"
          title="Сохранить статус (Enter)"
        >
          <FormIcon name="check" />
        </button>
        <button
          type="button"
          className={[styles.form__button, styles["form__button--cancel"]].join(" ")}
          onClick={onCancel}
          aria-label="Отмена (Esc)"
          title="Отмена (Esc)"
        >
          <FormIcon name="close" />
        </button>
      </div>
      {isCommentRequired && !values.comment.trim() ? (
        <p className={styles.form__note} role="alert">
          Для статуса «{selected?.title}» комментарий обязателен
        </p>
      ) : null}
      {selected?.isFinal && !isConfirming ? <p className={styles.form__note}>{CLOSING_WARNING}</p> : null}
      {isConfirming ? (
        <ClosingConfirm
          statusTitle={selected?.title ?? ""}
          isSubmitting={isSubmitting}
          onConfirm={() => void save()}
          onBack={() => setConfirming(false)}
        />
      ) : null}
      {submitError ? (
        <p className={styles.form__note} role="alert">
          {submitError}
        </p>
      ) : null}
    </form>
  );
}
