"use client";

import { useState } from "react";

import { LOG_LEVELS } from "@/entities/system";
import type { SystemLogLevel, SystemSettings, SystemSettingsPatch } from "@/shared/api";
import { SETTINGS_LIMITS, SETTINGS_NORMS } from "@/shared/api";
import { Button, Input, Panel, Select } from "@/shared/ui";

import type { SaveResult } from "../../model/useAdminSystem";
import { liveErrors, useSettingsForm } from "../../model/useSettingsForm";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type LoggingSettingsProps = {
  logging: SystemSettings["logging"];
  save: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

const LEVEL_OPTIONS = LOG_LEVELS.map((level) => ({ value: level, label: level }));

/** «Журналирование» (T4.2-20): уровень логов и срок хранения ≥ 6 месяцев (ТЗ §9). */
export function LoggingSettings({ logging, save }: LoggingSettingsProps) {
  const [level, setLevel] = useState<SystemLogLevel>(logging.level);
  const [retentionMonths, setRetentionMonths] = useState(String(logging.retentionMonths));
  const form = useSettingsForm(save);
  const patch: SystemSettingsPatch = { logging: { level, retentionMonths: Number(retentionMonths) } };
  const errors = { ...liveErrors(patch), ...form.errors };
  return (
    <Panel title="Журналирование" headerTone="dark">
      <div className={styles.section}>
        <div className={styles.section__grid}>
          <Select
            label="Уровень логов"
            tone="boxed"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={(event) => setLevel(event.target.value as SystemLogLevel)}
          />
          <Input
            label="Срок хранения журналов, мес."
            type="number"
            min={SETTINGS_NORMS.loggingMinRetentionMonths}
            max={SETTINGS_LIMITS.loggingMaxRetentionMonths}
            value={retentionMonths}
            onChange={(event) => setRetentionMonths(event.target.value)}
            hint="≥ 6 месяцев (ТЗ §9)"
            error={errors["logging.retentionMonths"]}
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
