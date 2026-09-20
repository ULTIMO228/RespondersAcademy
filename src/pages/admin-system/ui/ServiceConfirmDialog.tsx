"use client";

import { useId, useState } from "react";

import { SERVICE_ACTION_TITLES } from "@/entities/system";
import type { SystemService, SystemServiceAction } from "@/entities/system";
import { Button, Modal } from "@/shared/ui";

import styles from "./ServiceConfirmDialog.module.css";

type ServiceConfirmDialogProps = {
  service: SystemService;
  action: SystemServiceAction;
  onConfirm: () => void;
  onClose: () => void;
};

const DIALOG_WIDTH = 520;

/**
 * Подтверждение мок-действия (T4.2-09). Остановка критичного сервиса — двойное подтверждение:
 * второй шаг с чекбоксом «понимаю риск».
 */
export function ServiceConfirmDialog({ service, action, onConfirm, onClose }: ServiceConfirmDialogProps) {
  const riskId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const needsSecondStep = action === "stop" && service.critical;
  const isSecondStep = needsSecondStep && step === 2;
  const actionLabel = SERVICE_ACTION_TITLES[action];
  const confirmLabel = needsSecondStep && step === 1 ? "Продолжить" : actionLabel;
  const handleConfirm = () => {
    if (needsSecondStep && step === 1) {
      setStep(2);
      return;
    }
    onConfirm();
  };

  return (
    <Modal
      title={isSecondStep ? "Повторное подтверждение" : `${actionLabel}?`}
      onClose={onClose}
      width={DIALOG_WIDTH}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant={action === "stop" ? "danger" : "primary"}
            disabled={isSecondStep && !riskAccepted}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.dialog__text}>
        {actionLabel} сервис «{service.name}»? Действие записывается в журнал аудита.
      </p>
      {needsSecondStep ? (
        <p className={styles.dialog__warning} data-step={step}>
          {isSecondStep
            ? "Критичный сервис: остановка прервёт работу всех АРМ учебного класса. Подтвердите остановку ещё раз."
            : "Сервис критичный — потребуется повторное подтверждение (шаг 1 из 2)."}
        </p>
      ) : null}
      {isSecondStep ? (
        <label className={styles.dialog__risk} htmlFor={riskId}>
          <input
            id={riskId}
            type="checkbox"
            checked={riskAccepted}
            onChange={(event) => setRiskAccepted(event.target.checked)}
          />{" "}
          Понимаю риск остановки критичного сервиса
        </label>
      ) : null}
    </Modal>
  );
}
