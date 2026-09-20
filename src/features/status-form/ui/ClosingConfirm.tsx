import { Button } from "@/shared/ui";

import { CLOSING_CANCEL_LABEL, CLOSING_CONFIRM_LABEL, CLOSING_WARNING } from "../config/texts";

import styles from "./StatusForm.module.css";

type ClosingConfirmProps = {
  statusTitle: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
};

/** Предупреждение перед «Работы завершены» / «Отказ…»: сохранение закрывает карточку (памятка стр. 22). */
export function ClosingConfirm({ statusTitle, isSubmitting, onConfirm, onBack }: ClosingConfirmProps) {
  return (
    <div
      className={styles.form__confirm}
      role="alertdialog"
      aria-label={`Подтверждение статуса «${statusTitle}»`}
    >
      <p className={styles.form__warning}>{CLOSING_WARNING}</p>
      <div className={styles.form__actions}>
        <Button size="sm" variant="blue" onClick={onConfirm} disabled={isSubmitting}>
          {CLOSING_CONFIRM_LABEL}
        </Button>
        <Button size="sm" onClick={onBack} disabled={isSubmitting}>
          {CLOSING_CANCEL_LABEL}
        </Button>
      </div>
    </div>
  );
}
