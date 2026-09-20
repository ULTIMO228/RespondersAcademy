"use client";

import { useState } from "react";

import type { CardSource, SessionMode } from "@/entities/session";

import type { IssueOrder, WizardData, WizardScenario } from "./types";

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** Перестановка выбранного сценария на шаг вверх/вниз (ручной порядок выдачи, T3.2-06). */
function moveValue(values: string[], value: string, offset: number): string[] {
  const index = values.indexOf(value);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= values.length) return values;
  const next = [...values];
  next[index] = next[target];
  next[target] = value;
  return next;
}

/** Строжайшее значение из выбранных сценариев (нормативы и порог ошибок наследуются, T3.2-08). */
function inherit(
  scenarios: readonly WizardScenario[],
  pick: (scenario: WizardScenario) => number,
): number | undefined {
  return scenarios.length > 0 ? Math.min(...scenarios.map(pick)) : undefined;
}

/**
 * Состояние мастера занятия (T3.2-01): черновик конфигурации (состояние `draft` машины живёт на клиенте,
 * POST /sessions создаёт занятие уже `configured`). Нормативы и порог ошибок наследуются из выбранных
 * сценариев, пока преподаватель не переопределил их вручную.
 */
export function useWizardState(data: WizardData) {
  const { defaults } = data;
  const [group, setGroupValue] = useState(data.groups[0] ?? "");
  const [studentIds, setStudentIds] = useState<string[]>(defaults.studentIds);
  const [categories, setCategories] = useState<string[]>(defaults.categories);
  const [scenarioIds, setScenarioIds] = useState<string[]>(defaults.scenarioIds);
  const [cardSource, setCardSource] = useState<CardSource>(defaults.cardSource);
  const [order, setOrder] = useState<IssueOrder>("adaptive");
  const [mode, setMode] = useState<SessionMode>(defaults.mode);
  const [hasHints, setHasHints] = useState(false);
  const [isConveyor, setIsConveyor] = useState(false);
  const [paceSec, setPaceSec] = useState(defaults.paceSec);
  const [overrides, setOverrides] = useState<{
    reactionSec?: number;
    processingSec?: number;
    maxGrammarErrors?: number;
  }>({});

  const selectedScenarios = data.scenarios.filter((scenario) => scenarioIds.includes(scenario.id));
  const reactionSec =
    overrides.reactionSec ??
    inherit(selectedScenarios, (scenario) => scenario.reactionSec) ??
    defaults.reactionSec;
  const processingSec =
    overrides.processingSec ??
    inherit(selectedScenarios, (scenario) => scenario.processingSec) ??
    defaults.processingSec;
  const maxGrammarErrors =
    overrides.maxGrammarErrors ??
    inherit(selectedScenarios, (scenario) => scenario.maxGrammarErrors) ??
    defaults.maxGrammarErrors;

  return {
    group,
    studentIds,
    categories,
    scenarioIds,
    selectedScenarios,
    cardSource,
    order,
    mode,
    hasHints,
    isConveyor,
    reactionSec,
    processingSec,
    maxGrammarErrors,
    paceSec,
    setGroup: (next: string) => {
      setGroupValue(next);
      setStudentIds([]);
    },
    toggleStudent: (id: string) => setStudentIds((current) => toggleValue(current, id)),
    toggleCategory: (incidentGroup: string) =>
      setCategories((current) => toggleValue(current, incidentGroup)),
    toggleScenario: (id: string) => setScenarioIds((current) => toggleValue(current, id)),
    moveScenario: (id: string, offset: number) => setScenarioIds((current) => moveValue(current, id, offset)),
    setCardSource,
    setOrder,
    setMode,
    setHasHints,
    setIsConveyor,
    setReactionSec: (value: number) => setOverrides((current) => ({ ...current, reactionSec: value })),
    setProcessingSec: (value: number) => setOverrides((current) => ({ ...current, processingSec: value })),
    setMaxGrammarErrors: (value: number) =>
      setOverrides((current) => ({ ...current, maxGrammarErrors: value })),
    setPaceSec,
  };
}

export type WizardState = ReturnType<typeof useWizardState>;
