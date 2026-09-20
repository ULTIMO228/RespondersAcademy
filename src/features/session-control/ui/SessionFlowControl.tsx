"use client";

import { useState } from "react";

import { Button, Select } from "@/shared/ui";

import type { SessionControlApi } from "../model/deps";
import { defaultSessionControlApi, SessionControlApiContext } from "../model/deps";
import { useSessionControl } from "../model/useSessionControl";

import styles from "./SessionControl.module.css";

type SessionFlowControlProps = {
  sessionId: string;
  /** ФИО курсантов для выбора получателя внеочередной карточки; без них — идентификаторы занятия. */
  students?: { id: string; fullName: string }[];
  /** Вызывается после изменения выдачи — мониторингу перечитать занятие. */
  onChanged?: () => void;
  api?: SessionControlApi;
};

/**
 * Управление потоком карточек во время занятия (T3.2-11; spec/04-pages/12 «Управление во время занятия»):
 * пауза выдачи новых карточек и принудительная выдача карточки конкретному курсанту (ручной разгон темпа).
 * «Завершить занятие» — в шапке занятия на `/teacher` (widgets/monitor-grid).
 */
function FlowControl({ sessionId, students, onChanged }: Omit<SessionFlowControlProps, "api">) {
  const { control, status, message, send } = useSessionControl(sessionId);
  const [studentId, setStudentId] = useState("");

  if (status === "loading" || !control) return <p className={styles.control__note}>Загрузка занятия…</p>;

  const { session, paused, pendingCount } = control;
  const isBusy = status === "busy";
  const isRunning = session.state === "running";
  const options = (students ?? session.studentIds.map((id) => ({ id, fullName: id }))).map((student) => ({
    value: student.id,
    label: student.fullName,
  }));
  const selected = studentId || options[0]?.value || "";

  async function run(action: Parameters<typeof send>[0]) {
    await send(action);
    onChanged?.();
  }

  return (
    <div className={styles.control}>
      <div className={styles.control__group}>
        <Button
          variant="secondary"
          disabled={isBusy || !isRunning}
          onClick={() => void run({ action: paused ? "resume" : "pause" })}
        >
          {paused ? "Возобновить выдачу" : "Приостановить выдачу"}
        </Button>
        <span className={styles.control__note}>
          {paused ? `Выдача на паузе · ожидают ${pendingCount}` : `В расписании ещё ${pendingCount} карточек`}
        </span>
      </div>
      <div className={styles.control__group}>
        <Select
          label="Выдать карточку курсанту"
          value={selected}
          options={options}
          onChange={(event) => setStudentId(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={isBusy || !isRunning || options.length === 0}
          onClick={() => void run({ action: "issue", studentId: selected })}
        >
          Выдать сейчас
        </Button>
      </div>
      {status === "error" ? (
        <p className={styles.control__error} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function SessionFlowControl({ api = defaultSessionControlApi, ...props }: SessionFlowControlProps) {
  return (
    <SessionControlApiContext.Provider value={api}>
      <FlowControl {...props} />
    </SessionControlApiContext.Provider>
  );
}
