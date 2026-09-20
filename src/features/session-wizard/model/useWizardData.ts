"use client";

import { useEffect, useState } from "react";

import { buildWizardData } from "../lib/buildWizardData";
import type { WizardData, WizardLoadStatus } from "./types";
import type { SessionWizardApi } from "./deps";
import { useSessionWizardApi } from "./deps";

const STUDENT_ROLE = "student";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Данные мастера занятия (T3.2-01): состав группы (GET /users), группы ЕКП (GET /reference), утверждённые
 * сценарии (GET /scenarios?validationStatus=approved), учебные карточки (GET /training-cards), прошлые
 * занятия преподавателя (GET /sessions?teacherId) и привязка профилей (GET /profile-mapping).
 */
async function loadWizard(
  api: SessionWizardApi,
  teacherId: string,
  signal: AbortSignal,
): Promise<WizardData> {
  const [users, reference, scenarios, cards, sessions, profiles] = await Promise.all([
    api.listUsers({ role: STUDENT_ROLE }, signal),
    api.getReference(signal),
    api.listScenarios({ validationStatus: "approved" }, signal),
    api.listTrainingCards(signal),
    api.listSessions({ teacherId }, signal),
    api.getProfileMapping(signal),
  ]);
  return buildWizardData({
    users,
    incidentGroups: reference.incidentGroups,
    scenarios,
    cards,
    sessions,
    profiles,
  });
}

export function useWizardData(teacherId: string) {
  const api = useSessionWizardApi();
  const [data, setData] = useState<WizardData | null>(null);
  const [status, setStatus] = useState<WizardLoadStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    loadWizard(api, teacherId, controller.signal)
      .then((loaded) => {
        setData(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!isAbortError(error) && !controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [api, teacherId]);

  return { data, status };
}
