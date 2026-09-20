"use client";

import { useId, useState } from "react";
import type { ChangeEvent } from "react";

import { Button, Panel } from "@/shared/ui";

import { SESSION_LOCK_NOTE } from "../../lib/session-guard";
import { useMockProgress } from "../../model/useMockProgress";
import { MockProgress } from "../MockProgress";

import styles from "./SettingsSection.module.css";

type UpdateSettingsProps = {
  /** Пакетное обновление вне активного занятия (ручной режим, ТЗ §6). */
  sessionRunning: boolean;
};

const UPDATE_FILE_ACCEPT = ".tar.gz,.zip";

/** «Пакетное обновление» (T4.2-21): выбор файла и мок-прогресс; файл никуда не отправляется. */
export function UpdateSettings({ sessionRunning }: UpdateSettingsProps) {
  const inputId = useId();
  const [fileName, setFileName] = useState("");
  const { progress, isRunning, isDone, start } = useMockProgress();
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) =>
    setFileName(event.target.files?.[0]?.name ?? "");
  return (
    <Panel title="Пакетное обновление" headerTone="dark">
      <div className={styles.section}>
        <div className={styles.section__actions}>
          <label htmlFor={inputId} className={styles.section__meta}>
            Файл пакета ({UPDATE_FILE_ACCEPT}):
          </label>
          <input
            id={inputId}
            type="file"
            accept={UPDATE_FILE_ACCEPT}
            className={styles.section__file}
            onChange={handleFileChange}
          />
        </div>
        <div className={styles.section__actions}>
          <Button
            variant="primary"
            disabled={isRunning || fileName === "" || sessionRunning}
            title={sessionRunning ? SESSION_LOCK_NOTE : undefined}
            onClick={start}
          >
            Загрузить пакет обновления
          </Button>
          {isDone ? (
            <span className={styles.section__meta} role="status">
              Пакет «{fileName}» принят (мок).
            </span>
          ) : null}
        </div>
        {progress !== null ? <MockProgress label="Установка пакета" progress={progress} /> : null}
        <p className={styles.section__note}>
          Заглушка: файл не отправляется на сервер и никуда не загружается — ручной режим обновления выполняет
          администратор вне активного занятия (ТЗ §6).
        </p>
        {sessionRunning ? <p className={styles.section__note}>{SESSION_LOCK_NOTE}: идёт занятие.</p> : null}
      </div>
    </Panel>
  );
}
