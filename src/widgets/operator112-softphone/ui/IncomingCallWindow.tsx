"use client";

import { useEffect, useId, useRef } from "react";

import { formatAon } from "@/entities/operator112-attempt";

import styles from "./CallWindows.module.css";

type IncomingCallWindowProps = {
  aon: string;
  isAnswering?: boolean;
  onAnswer: () => void;
  /** «×» прячет окно без приёма: вызов остаётся в очереди, трубка полосы телефонии открывает окно снова. */
  onClose: () => void;
};

/** Окно «Входящий звонок» АРМ-112 поверх затемнённого экрана (ИНСТРУКЦИЯ_4; спека 009, FR-009). */
export function IncomingCallWindow({ aon, isAnswering = false, onAnswer, onClose }: IncomingCallWindowProps) {
  const titleId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => acceptRef.current?.focus(), []);
  return (
    <div className={styles.overlay}>
      <div className={styles.call} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button
          type="button"
          className={styles.call__close}
          aria-label="Закрыть окно вызова"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id={titleId} className={styles.call__title}>
          Входящий звонок
        </h2>
        <p className={styles.call__from}>с номера {formatAon(aon)}</p>
        <button
          ref={acceptRef}
          type="button"
          className={styles.call__accept}
          onClick={onAnswer}
          disabled={isAnswering}
        >
          {isAnswering ? "Соединение…" : "Принять"}
        </button>
      </div>
    </div>
  );
}
