"use client";

import type { AdminSystemModel } from "../model/useAdminSystem";
import type { SystemOverview } from "../model/types";
import { BackupSettings } from "./settings/BackupSettings";
import { DatabaseSettings } from "./settings/DatabaseSettings";
import { LoggingSettings } from "./settings/LoggingSettings";
import { PerformanceSettings } from "./settings/PerformanceSettings";
import { SecuritySettings } from "./settings/SecuritySettings";
import { TelephonySettings } from "./settings/TelephonySettings";
import { UpdateSettings } from "./settings/UpdateSettings";

import styles from "./SettingsTab.module.css";

type SettingsTabProps = {
  overview: SystemOverview;
  model: AdminSystemModel;
};

/** Секция 3 «Настройки» (spec/000-фронт/04-pages/21): 7 подсекций, сохранение — в мок через PATCH. */
export function SettingsTab({ overview, model }: SettingsTabProps) {
  const { settings } = overview;
  const save = model.saveSettings;
  return (
    <div className={styles.settings}>
      <TelephonySettings telephony={settings.telephony} save={save} />
      <DatabaseSettings database={settings.database} />
      <SecuritySettings security={settings.security} save={save} />
      <PerformanceSettings performance={settings.performance} save={save} />
      <BackupSettings backup={settings.backup} sessionRunning={overview.sessionRunning} save={save} />
      <LoggingSettings logging={settings.logging} save={save} />
      <UpdateSettings sessionRunning={overview.sessionRunning} />
    </div>
  );
}
