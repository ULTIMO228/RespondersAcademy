"use client";

import { useEffect, useState } from "react";

import type { PublicUser } from "@/shared/api";

import { buildAssignedModules, collectModuleCardIds } from "../lib/modules";
import type { JournalApi } from "./deps";
import { useJournalDeps } from "./deps";
import { isAbortError, toFailureStatus } from "./loadStatus";
import type { AssignedModule, LoadStatus } from "./types";

const APPROVED = "approved";

async function loadCardGroups(api: JournalApi, cardIds: string[], signal: AbortSignal) {
  const details = await Promise.all(cardIds.map((cardId) => api.getCard(cardId, signal).catch(() => null)));
  return Object.fromEntries(
    details.flatMap((detail) => (detail?.kind === "training" ? [[detail.card.id, detail.card.group]] : [])),
  ) as Record<string, string>;
}

async function loadModules(api: JournalApi, studentId: string, signal: AbortSignal) {
  const [sessions, scenarios] = await Promise.all([
    api.listSessions({ studentId }, signal),
    api.listScenarios({ validationStatus: APPROVED }, signal),
  ]);
  const groups = await loadCardGroups(api, collectModuleCardIds(studentId, sessions, scenarios), signal);
  return buildAssignedModules(studentId, sessions, scenarios, groups);
}

/** «Мои назначенные модули» (T2.2-15): занятия курсанта (GET /sessions?studentId) × approved-сценарии. */
export function useAssignedModules(student: PublicUser) {
  const { api } = useJournalDeps();
  const [modules, setModules] = useState<AssignedModule[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();
    loadModules(api, student.id, controller.signal)
      .then((loaded) => {
        setModules(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!isAbortError(error) && !controller.signal.aborted) setStatus(toFailureStatus(error));
      });
    return () => controller.abort();
  }, [api, student.id]);

  return { modules, status };
}
