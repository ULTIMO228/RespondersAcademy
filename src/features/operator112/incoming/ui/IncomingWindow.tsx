"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";

import { formatAon } from "@/entities/operator112-attempt";

import styles from "./IncomingWindow.module.css";

type IncomingWindowProps = {
  /** Канал вызова: звонок (ИНСТРУКЦИЯ_4) или СМС (ИНСТРУКЦИЯ_107). */
  channel?: "call" | "sms";
  /** Номер заявителя, 10 цифр без «+7»: у звонка форматируется, у СМС выводится как есть. */
  aon: string;
  isAnswering?: boolean;
  onAccept: () => void;
  /** «×» прячет окно без приёма: вызов остаётся в очереди. */
  onHide: () => void;
};

/**
 * Окно «Входящий звонок» / «Входящее сообщение» АРМ-112 поверх затемнённого экрана (спека 009, FR-009;
 * ИНСТРУКЦИЯ_4 и ИНСТРУКЦИЯ_107). Enter = «Принять».
 */
export function IncomingWindow({
  channel = "call",
  aon,
  isAnswering = false,
  onAccept,
  onHide,
}: IncomingWindowProps) {
  const titleId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const isSms = channel === "sms";
  useEffect(() => acceptRef.current?.focus(), []);
  // Esc — как «×»: окно скрывается, вызов остаётся в очереди (памятка §3.17: Esc закрывает всплывающее окно).
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onHideRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Кнопка в фокусе обрабатывает Enter сама (click); перехватываем только Enter вне кнопок.
    if (event.key === "Enter" && !isAnswering && event.target === event.currentTarget) {
      event.preventDefault();
      onAccept();
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-channel={channel}
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          className={styles.window__close}
          aria-label="Закрыть окно вызова"
          onClick={onHide}
        >
          ×
        </button>
        <h2 id={titleId} className={styles.window__title}>
          {isSms ? "Входящее сообщение" : "Входящий звонок"}
        </h2>
        {isSms ? (
          <>
            <p className={styles.window__line}>Источник - СМС</p>
            <p className={styles.window__line}>карточка {aon.replace(/\D/g, "")}</p>
          </>
        ) : (
          <p className={styles.window__line}>с номера {formatAon(aon)}</p>
        )}
        <button
          ref={acceptRef}
          type="button"
          className={styles.window__accept}
          onClick={onAccept}
          disabled={isAnswering}
        >
          {isAnswering ? "Соединение…" : "Принять"}
        </button>
      </div>
    </div>
  );
}
