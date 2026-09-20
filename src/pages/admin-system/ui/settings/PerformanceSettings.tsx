"use client";

import { useState } from "react";

import type { SystemSettings, SystemSettingsPatch } from "@/shared/api";
import { SETTINGS_LIMITS, SETTINGS_NORMS } from "@/shared/api";
import { Button, Input, Panel } from "@/shared/ui";

import type { SaveResult } from "../../model/useAdminSystem";
import { liveErrors, useSettingsForm } from "../../model/useSettingsForm";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type PerformanceSettingsProps = {
  performance: SystemSettings["performance"];
  save: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

/** «Производительность» (T4.2-18): лимит сессий ≥ 20 (ТЗ §7), интервал опроса, буфер ввода. */
export function PerformanceSettings({ performance, save }: PerformanceSettingsProps) {
  const [sessionLimit, setSessionLimit] = useState(String(performance.sessionLimit));
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(String(performance.refreshIntervalSec));
  const [inputBufferRecords, setInputBufferRecords] = useState(String(performance.inputBufferRecords));
  const form = useSettingsForm(save);
  const patch: SystemSettingsPatch = {
    performance: {
      sessionLimit: Number(sessionLimit),
      refreshIntervalSec: Number(refreshIntervalSec),
      inputBufferRecords: Number(inputBufferRecords),
    },
  };
  const errors = { ...liveErrors(patch), ...form.errors };
  return (
    <Panel title="Производительность" headerTone="dark">
      <div className={styles.section}>
        <div className={styles.section__grid}>
          <Input
            label="Лимит одновременных сессий"
            type="number"
            min={SETTINGS_NORMS.sessionLimitMin}
            max={SETTINGS_LIMITS.sessionLimitMax}
            value={sessionLimit}
            onChange={(event) => setSessionLimit(event.target.value)}
            hint={`≥ 20 одновременных сессий (ТЗ §7); до ${SETTINGS_LIMITS.sessionLimitMax}`}
            error={errors["performance.sessionLimit"]}
          />
          <Input
            label="Интервал автообновления ленты карточек, сек"
            type="number"
            min={SETTINGS_LIMITS.refreshMinSec}
            max={SETTINGS_LIMITS.refreshMaxSec}
            value={refreshIntervalSec}
            onChange={(event) => setRefreshIntervalSec(event.target.value)}
            hint={`от ${SETTINGS_LIMITS.refreshMinSec} до ${SETTINGS_LIMITS.refreshMaxSec} сек`}
            error={errors["performance.refreshIntervalSec"]}
          />
          <Input
            label="Буфер ввода при сбоях связи, записей"
            type="number"
            min={SETTINGS_LIMITS.bufferMinRecords}
            max={SETTINGS_LIMITS.bufferMaxRecords}
            value={inputBufferRecords}
            onChange={(event) => setInputBufferRecords(event.target.value)}
            hint={`от ${SETTINGS_LIMITS.bufferMinRecords} до ${SETTINGS_LIMITS.bufferMaxRecords} записей`}
            error={errors["performance.inputBufferRecords"]}
          />
        </div>
        <div className={styles.section__actions}>
          <Button variant="primary" disabled={form.status === "saving"} onClick={() => form.submit(patch)}>
            Сохранить
          </Button>
          <SectionStatus form={form} />
        </div>
      </div>
    </Panel>
  );
}
