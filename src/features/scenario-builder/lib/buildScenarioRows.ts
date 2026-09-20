import type { Scenario } from "@/shared/api";

import type { ScenarioRow, TrainingCardView } from "../model/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** Карточки сценария в порядке `cardIds` (карточка может встречаться в нескольких сценариях). */
export function getScenarioCards(scenario: Scenario, cards: readonly TrainingCardView[]): TrainingCardView[] {
  return scenario.cardIds.flatMap((cardId) => cards.filter((card) => card.id === cardId));
}

/** Строка таблицы: категории — группы ЕКП карточек сценария, итоговые типы — по матрице ЕКП. */
export function buildScenarioRow(scenario: Scenario, cards: readonly TrainingCardView[]): ScenarioRow {
  const scenarioCards = getScenarioCards(scenario, cards);
  return {
    id: scenario.id,
    title: scenario.title,
    categories: unique(scenarioCards.map((card) => card.group)),
    finalTypes: unique(scenarioCards.flatMap((card) => card.finalTypes)),
    difficulty: scenario.difficulty,
    source: scenario.source,
    status: scenario.validation.status,
    comment: scenario.validation.comment,
    keyPhrases: scenario.etalon.keyPhrases,
    cardCount: scenario.cardIds.length,
  };
}

export function buildScenarioRows(
  scenarios: readonly Scenario[],
  cards: readonly TrainingCardView[],
): ScenarioRow[] {
  return scenarios.map((scenario) => buildScenarioRow(scenario, cards));
}
