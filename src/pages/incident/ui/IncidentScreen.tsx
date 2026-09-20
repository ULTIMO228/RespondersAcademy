"use client";

import Link from "next/link";

import type { PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button } from "@/shared/ui";

import { useIncidentData } from "../model/useIncidentData";
import { IncidentWorkspace } from "./IncidentWorkspace";

import styles from "./IncidentPage.module.css";

export type IncidentScreenProps = {
  cardId: string;
  student: PublicUser;
  /** Время выдачи карточки лентой занятия (?issuedAt=) — для первичной реакции. */
  issuedAt?: string;
  /** Мок-флаг блокировки дополнения другим пользователем, сек (?amendLock=). */
  amendLockSeconds?: number;
};

/** Клиентская часть экрана: загрузка карточки через мок-слой и состояния loading / 404 / ошибка / offline. */
export function IncidentScreen({ cardId, student, issuedAt, amendLockSeconds }: IncidentScreenProps) {
  const { state, retry } = useIncidentData({ cardId, studentId: student.id, issuedAt });

  if (state.status === "ready") {
    return <IncidentWorkspace data={state.data} student={student} amendLockSeconds={amendLockSeconds} />;
  }
  return (
    <main className={styles.page}>
      <h1 className="visually-hidden">Карточка происшествия</h1>
      {state.status === "loading" ? (
        <p className={styles.page__state} role="status">
          Загрузка карточки…
        </p>
      ) : null}
      {state.status === "notFound" ? (
        <p className={styles.page__state} role="alert">
          {state.message}. <Link href={ROUTES.arm}>К списку происшествий</Link>
        </p>
      ) : null}
      {state.status === "error" ? (
        <div className={styles.page__state} role="alert">
          <p>
            {state.isOffline ? "Соединение потеряно — восстанавливаем…" : `Ошибка загрузки: ${state.message}`}
          </p>
          <Button size="sm" onClick={retry}>
            Повторить
          </Button>
        </div>
      ) : null}
    </main>
  );
}
