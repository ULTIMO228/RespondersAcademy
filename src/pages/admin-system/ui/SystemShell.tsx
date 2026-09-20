"use client";

import { useState } from "react";

import { hasActiveFailure, findActiveFailures } from "@/entities/system";
import { Button, Tabs } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import type { SystemTabId } from "../config/systemTabs";
import { DEFAULT_TAB, SYSTEM_TABS } from "../config/systemTabs";
import { useAdminSystem } from "../model/useAdminSystem";
import { LogsTab } from "./LogsTab";
import { MonitoringTab } from "./MonitoringTab";
import { ServicesTab } from "./ServicesTab";
import { SettingsTab } from "./SettingsTab";

import styles from "./SystemShell.module.css";

type SystemShellProps = {
  /** Администратор сессии: его id уходит в журнал аудита вместе с действиями. */
  adminId: string;
  /** Подмена клиента данных в тестах. */
  api?: SystemApi;
};

/** Каркас /admin/system: баннер активного сбоя и 4 вкладки (T4.2-07). */
export function SystemShell({ adminId, api }: SystemShellProps) {
  const [activeTab, setActiveTab] = useState<SystemTabId>(DEFAULT_TAB);
  const model = useAdminSystem(adminId, api);
  const { state } = model;

  if (state.status === "loading") {
    return (
      <p className={styles.shell__state} role="status">
        Загрузка состояния системы…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className={styles.shell__state} role="alert">
        <p>{state.isOffline ? "Нет соединения с сервером — данные недоступны" : state.message}</p>
        <Button size="sm" onClick={model.reload}>
          Повторить
        </Button>
      </div>
    );
  }

  const failures = findActiveFailures(state.services);
  return (
    <div className={styles.shell}>
      {hasActiveFailure(state.services) ? (
        <div className={styles.shell__banner} role="alert">
          <strong>Активный сбой.</strong> {failures.map((service) => service.name).join(", ")} — проверьте
          ленту оповещений об ошибках.
          {state.settings.autoRecovery.enabled ? " Автовосстановление включено." : ""}
        </div>
      ) : null}
      <header className={styles.shell__header}>
        <h1 className={styles.shell__title}>Система</h1>
      </header>
      <Tabs
        items={SYSTEM_TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as SystemTabId)}
        label="Разделы управления системой"
      />
      <div
        className={styles.shell__panel}
        role="tabpanel"
        aria-label={SYSTEM_TABS.find((tab) => tab.id === activeTab)?.title}
      >
        {activeTab === "services" ? (
          <ServicesTab overview={state} model={model} />
        ) : activeTab === "monitoring" ? (
          <MonitoringTab api={api} />
        ) : activeTab === "settings" ? (
          <SettingsTab overview={state} model={model} />
        ) : (
          <LogsTab overview={state} api={api} />
        )}
      </div>
    </div>
  );
}
