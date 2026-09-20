"use client";

import { useState } from "react";

import type { ServiceStatusEvent } from "@/entities/service";

import { toServiceHistory } from "./serviceTiles";
import type { ServiceHistory, ServicePanelCard } from "./types";

/** История статусов служб: управляемая (живой режим) или локальная из фикстуры (прототип, просмотр). */
export function useServiceHistory(card: ServicePanelCard, controlled?: ServiceHistory) {
  const [localHistory, setLocalHistory] = useState(() => toServiceHistory(card));

  function addStatusEvent(serviceId: string, event: ServiceStatusEvent) {
    setLocalHistory((previous) => ({ ...previous, [serviceId]: [...(previous[serviceId] ?? []), event] }));
  }

  return { history: controlled ?? localHistory, addStatusEvent };
}
