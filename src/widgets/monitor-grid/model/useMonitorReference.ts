"use client";

import { useEffect, useState } from "react";

import type { ReferenceData } from "@/shared/api";

import { useMonitorDeps } from "./deps";

export type MonitorReference = Pick<
  ReferenceData,
  "ddsStatuses" | "internalNumbers" | "services" | "serviceStatuses"
>;

const EMPTY: MonitorReference = {
  ddsStatuses: [],
  internalNumbers: [],
  services: [],
  serviceStatuses: [],
};

/**
 * Справочники мониторинга (GET /reference): статусы ДДС (плитки, лента), внутренние номера (подписи
 * эталона), службы и их статусы (зеркало экрана). Сбой не ломает экран — показываются коды.
 */
export function useMonitorReference(): MonitorReference {
  const { api } = useMonitorDeps();
  const [reference, setReference] = useState<MonitorReference>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    api.getReference(controller.signal).then(
      ({ ddsStatuses, internalNumbers, services, serviceStatuses }) => {
        if (!controller.signal.aborted) {
          setReference({ ddsStatuses, internalNumbers, services, serviceStatuses });
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  return reference;
}
