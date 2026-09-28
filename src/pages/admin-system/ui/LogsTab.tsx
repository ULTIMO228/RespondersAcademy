"use client";

import { Panel } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import type { SystemOverview } from "../model/types";
import { AuditJournal } from "./AuditJournal";
import { SystemLogFeed } from "./SystemLogFeed";

import styles from "./LogsTab.module.css";

type LogsTabProps = {
  overview: SystemOverview;
  api?: SystemApi;
};

const RETENTION_NOTE = "Хранение ≥ 6 месяцев (ТЗ §9)";

/** Секция 4 «Журналы и аудит» (spec/000-фронт/04-pages/21). */
export function LogsTab({ overview, api }: LogsTabProps) {
  return (
    <div className={styles.logsTab}>
      <p className={styles.logsTab__retention}>{RETENTION_NOTE}</p>
      <Panel title="Журнал аудита" headerTone="dark" className={styles.logsTab__audit}>
        <AuditJournal api={api} />
      </Panel>
      <Panel title="Системные журналы" headerTone="dark" actions={<span>{RETENTION_NOTE}</span>}>
        <SystemLogFeed
          initialLogs={overview.logs}
          refreshIntervalSec={overview.settings.performance.refreshIntervalSec}
          services={overview.services}
          api={api}
        />
      </Panel>
    </div>
  );
}
