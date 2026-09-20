"use client";

import { useState } from "react";

import type { SystemServiceAction } from "@/entities/system";
import type { SystemService } from "@/shared/api";

import { isServiceActionLocked } from "../lib/session-guard";
import type { AdminSystemModel } from "../model/useAdminSystem";
import type { SystemOverview } from "../model/types";
import { AlertFeed } from "./AlertFeed";
import { ServiceConfirmDialog } from "./ServiceConfirmDialog";
import { ServiceTile } from "./ServiceTile";
import { SystemIndicators } from "./SystemIndicators";

import styles from "./ServicesTab.module.css";

type ServicesTabProps = {
  overview: SystemOverview;
  model: AdminSystemModel;
};

type PendingAction = { service: SystemService; action: SystemServiceAction };

/** Секция 1 «Состояние сервисов» (spec/04-pages/21): плитки, индикаторы, оповещения. */
export function ServicesTab({ overview, model }: ServicesTabProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const confirm = async () => {
    if (!pending) return;
    const { service, action } = pending;
    setPending(null);
    await model.runServiceAction(service.id, action);
  };
  return (
    <div className={styles.services}>
      <SystemIndicators
        integrity={overview.integrity}
        autoRecovery={overview.settings.autoRecovery.enabled}
        onToggleAutoRecovery={(enabled) => model.saveSettings({ autoRecovery: { enabled } })}
      />
      <div className={styles.services__grid}>
        {overview.services.map((service) => (
          <ServiceTile
            key={service.id}
            service={service}
            isPending={model.pendingServiceId === service.id}
            isLocked={isServiceActionLocked(service, "stop", overview.sessionRunning)}
            onAction={(action) => setPending({ service, action })}
          />
        ))}
      </div>
      <AlertFeed logs={overview.logs} services={overview.services} />
      {pending ? (
        <ServiceConfirmDialog
          service={pending.service}
          action={pending.action}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}
