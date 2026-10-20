"use client";

import { useResource } from "@/shared/ui/platform";

import type { StudentScenariosApi } from "../api/scenariosApi";

/** Список назначенных сценариев: loading → ready | error | serverRequired. */
export function useScenarioList(api: StudentScenariosApi) {
  return useResource((signal) => api.list(signal), [api]);
}
