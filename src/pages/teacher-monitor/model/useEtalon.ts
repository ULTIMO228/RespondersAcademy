"use client";

import { useEffect, useState } from "react";

import { useMonitorDeps } from "@/widgets/monitor-grid";
import type { Scenario } from "@/shared/api";

export type EtalonView = {
  /** Действия эталона всего сценария (сегмент по карточке выбирает вызывающий). */
  expectedActions: string[];
  scenarioTitle: string;
};

const EMPTY: EtalonView = { expectedActions: [], scenarioTitle: "—" };

function pickScenario(scenarios: Scenario[], cardId: string, scenarioIds: readonly string[]) {
  const withCard = scenarios.filter((scenario) => scenario.cardIds.includes(cardId));
  return withCard.find((scenario) => scenarioIds.includes(scenario.id)) ?? withCard[0] ?? null;
}

/**
 * Эталон текущей карточки курсанта (T3.3-08): сценарий занятия, в котором есть эта карточка.
 * Сверка ведётся по данным эталона (Etalon.expectedActions), а не по зашитому списку действий.
 */
export function useEtalon(cardId: string | null, scenarioIds: readonly string[]): EtalonView {
  const { api } = useMonitorDeps();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api.listScenarios(undefined, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) setScenarios(loaded);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  if (!cardId) return EMPTY;
  const scenario = pickScenario(scenarios, cardId, scenarioIds);
  if (!scenario) return EMPTY;
  return {
    expectedActions: scenario.etalon?.expectedActions ?? [],
    scenarioTitle: scenario.title,
  };
}
