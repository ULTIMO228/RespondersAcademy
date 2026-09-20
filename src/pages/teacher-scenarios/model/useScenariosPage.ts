"use client";

import { useCallback, useEffect, useState } from "react";

import { buildScenarioQuery, EMPTY_FILTER } from "@/features/scenario-builder";
import type { ScenarioFilterState } from "@/features/scenario-builder";
import type { GrammarError, ScenarioCreateRequest } from "@/shared/api";

import { defaultScenariosApi, loadScenariosPage } from "../api/scenariosApi";
import type { ScenariosApi, ScenariosPageData } from "../api/scenariosApi";

export type ScenariosPageState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ScenariosPageData };

type UseScenariosPageOptions = {
  /** Преподаватель сессии — автор всех действий (аудит, reviewedBy). */
  teacherId: string;
  api?: ScenariosApi;
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось загрузить сценарии";
}

/** Состояние `/teacher/scenarios`: загрузка по фильтрам + действия конструктора через мок-слой. */
export function useScenariosPage({ teacherId, api = defaultScenariosApi }: UseScenariosPageOptions) {
  const [filter, setFilter] = useState<ScenarioFilterState>(EMPTY_FILTER);
  const [state, setState] = useState<ScenariosPageState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));
    loadScenariosPage(api, buildScenarioQuery(filter), controller.signal)
      .then((data) => {
        if (isActive) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (isActive && !controller.signal.aborted) setState({ status: "error", message: toMessage(error) });
      });
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [api, filter, reloadToken]);

  const createScenario = useCallback(
    async (body: ScenarioCreateRequest) => {
      const scenario = await api.createScenario(body);
      reload();
      return scenario;
    },
    [api, reload],
  );

  const generateScenarios = useCallback(
    async (category: string) => {
      const generated = await api.generateScenarios({ category, requestedBy: teacherId });
      reload();
      return generated;
    },
    [api, reload, teacherId],
  );

  const removeScenario = useCallback(
    async (scenarioId: string) => {
      await api.deleteScenario(scenarioId, teacherId);
      reload();
    },
    [api, reload, teacherId],
  );

  const uploadMaterial = useCallback(
    async (name: string, sizeBytes: number) => {
      await api.uploadMaterial({ name, sizeBytes, uploadedBy: teacherId });
      reload();
    },
    [api, reload, teacherId],
  );

  const saveProfileMapping = useCallback(
    async (rows: { id: string; incidentGroups: string[] }[]) => {
      await api.saveProfileMapping({ rows, savedBy: teacherId });
      reload();
    },
    [api, reload, teacherId],
  );

  const checkGrammar = useCallback(
    async (text: string): Promise<GrammarError[]> => (await api.checkGrammar(text)).data,
    [api],
  );

  return {
    state,
    filter,
    setFilter,
    createScenario,
    generateScenarios,
    removeScenario,
    uploadMaterial,
    saveProfileMapping,
    checkGrammar,
  };
}
