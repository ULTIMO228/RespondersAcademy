"use client";

import { useEffect, useState } from "react";

import type { SystemSettings, SystemSettingsPatch } from "@/shared/api";
import { SETTINGS_LIMITS, SETTINGS_NORMS } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { Button, Input, Panel } from "@/shared/ui";

import { BACKUP_STALE_NOTE, isBackupStale, SESSION_LOCK_NOTE } from "../../lib/session-guard";
import type { SaveResult } from "../../model/useAdminSystem";
import { useMockProgress } from "../../model/useMockProgress";
import { liveErrors, useSettingsForm } from "../../model/useSettingsForm";
import { MockProgress } from "../MockProgress";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type BackupSettingsProps = {
  backup: SystemSettings["backup"];
  /** Во время занятия ручной бэкап не запускается: операция влияет на учебный процесс (ТЗ §8). */
  sessionRunning: boolean;
  save: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

/** Момент завершения мок-бэкапа в формате меток мок-слоя (ISO +03:00). */
function nowMoscowIso(): string {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+03:00`;
}

/** «Резервное копирование» (T4.2-19): период ≤ 24 ч, сжатие-пометка, «Выполнить сейчас» с прогрессом. */
export function BackupSettings({ backup, sessionRunning, save }: BackupSettingsProps) {
  const [periodHours, setPeriodHours] = useState(String(backup.periodHours));
  const { progress, isRunning, isDone, start } = useMockProgress();
  const [isSaved, setSaved] = useState(false);
  const form = useSettingsForm(save);
  const patch: SystemSettingsPatch = { backup: { periodHours: Number(periodHours) } };
  const errors = { ...liveErrors(patch), ...form.errors };
  const isStale = isBackupStale(backup.lastAt, Date.now());

  /* Мок-прогресс дошёл до конца — фиксируем время последнего бэкапа в настройках и в аудите. */
  useEffect(() => {
    if (!isDone || isSaved) return;
    setSaved(true);
    void save({ backup: { lastAt: nowMoscowIso() } });
  }, [isDone, isSaved, save]);

  return (
    <Panel title="Резервное копирование" headerTone="dark">
      <div className={styles.section}>
        <div className={styles.section__grid}>
          <Input
            label="Периодичность, ч"
            type="number"
            min={SETTINGS_LIMITS.backupMinPeriodHours}
            max={SETTINGS_NORMS.backupMaxPeriodHours}
            value={periodHours}
            onChange={(event) => setPeriodHours(event.target.value)}
            hint="не реже 1 раза в сутки (ТЗ §9)"
            error={errors["backup.periodHours"]}
          />
          <p className={styles.section__meta}>
            Последний бэкап: <strong>{formatDateTime(backup.lastAt)}</strong>
            <br />
            Архив создаётся со сжатием (ТЗ §12) — декларация для бэкенда.
          </p>
        </div>
        <div className={styles.section__actions}>
          <Button variant="primary" disabled={form.status === "saving"} onClick={() => form.submit(patch)}>
            Сохранить
          </Button>
          <Button
            variant="ghost"
            disabled={isRunning || sessionRunning}
            title={sessionRunning ? SESSION_LOCK_NOTE : undefined}
            onClick={() => {
              setSaved(false);
              start();
            }}
          >
            Выполнить сейчас
          </Button>
          <SectionStatus form={form} />
          {isDone ? <span className={styles.section__meta}>Резервная копия создана (мок).</span> : null}
        </div>
        {progress !== null ? <MockProgress label="Резервное копирование" progress={progress} /> : null}
        {sessionRunning ? <p className={styles.section__note}>{SESSION_LOCK_NOTE}: идёт занятие.</p> : null}
        {isStale ? (
          <p className={styles.section__note} role="alert">
            {BACKUP_STALE_NOTE}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
