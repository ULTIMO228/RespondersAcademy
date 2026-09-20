"use client";

import { useState } from "react";

import { Button, Modal, TimerBadge } from "@/shared/ui";

import type { SessionHeaderModel } from "../model/types";

import styles from "./SessionHeader.module.css";

type SessionHeaderProps = {
  header: SessionHeaderModel;
  finishedTitle: string;
  /** Завершение занятия (POST /sessions/[id]/stop, T3.2-11) — доступно в любой момент идущего занятия. */
  onFinish: () => Promise<void> | void;
  /** Сообщение об ошибке завершения (мок-слой отказал). */
  finishError?: string | null;
};

/**
 * Шапка занятия (по образцу верхней панели ПОВ-112, p12_Image66): ID, состояние, живое время, завершение.
 * «Сформировать отчёт» после завершения — в баннере `features/session-control` (он же делает переход
 * finished → reported), чтобы кнопка не дублировалась в двух местах.
 */
export function SessionHeader({ header, finishedTitle, onFinish, finishError }: SessionHeaderProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function handleFinish() {
    setIsBusy(true);
    try {
      await onFinish();
      setIsConfirmOpen(false);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.header__main}>
        <h1 className={styles.header__title}>{header.title}</h1>
        <p className={styles.header__meta}>
          ID {header.sessionId} · режим: {header.modeTitle} · преподаватель {header.teacherName} · курсантов:{" "}
          {header.studentCount}
        </p>
        {finishError ? <p className={styles.header__error}>{finishError}</p> : null}
      </div>
      <div className={styles.header__status}>
        <span
          className={[styles.header__state, header.isFinished ? styles["header__state--finished"] : ""].join(
            " ",
          )}
        >
          {header.isFinished ? finishedTitle : header.stateTitle}
        </span>
        <span className={styles.header__started}>старт {header.startedAt}</span>
        <TimerBadge value={header.elapsed} size="lg" caption="от старта занятия" />
      </div>
      {header.isFinished ? null : (
        <button
          type="button"
          className={styles.header__action}
          onClick={() => setIsConfirmOpen(true)}
          title="Завершить занятие (доступно в любой момент)"
        >
          Завершить занятие
        </button>
      )}
      {isConfirmOpen ? (
        <Modal
          title="Завершить занятие?"
          onClose={() => setIsConfirmOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>
                Отмена
              </Button>
              <Button variant="primary" onClick={handleFinish} disabled={isBusy}>
                {isBusy ? "Завершаем…" : "Завершить"}
              </Button>
            </>
          }
        >
          <p>
            Выдача новых карточек прекратится, незавершённые попытки будут закрыты. После завершения можно
            сформировать отчёт о занятии. Действие фиксируется в журнале аудита.
          </p>
        </Modal>
      ) : null}
    </header>
  );
}
