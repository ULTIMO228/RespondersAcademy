/*
 * Модель редактора: параметры, эталон, вопросы предпросмотра и поля для частичного утверждения.
 * Чистая функция от живого `Scenario` и статического контекста страницы — тестируется без сети.
 */
import { getEtalonText, getScenarioCards } from "@/features/scenario-builder";
import type { LabeledValue, PreviewQuestion, ScenarioParamsView } from "@/features/scenario-builder";
import type { TrainingCardView } from "@/features/scenario-builder";
import { describeEtalonAction, getCardEtalonSegment } from "@/entities/session";
import { PROCESSING_NORM_SEC, REACTION_NORM_SEC } from "@/entities/session";
import type { Scenario } from "@/shared/api";

import type { ScenarioEditorContext } from "./buildEditorData";

const DEFAULT_MODE = "practice";
const ACTION_SEPARATOR = " → ";

export function buildParams(
  scenario: Scenario,
  scenarioCards: TrainingCardView[],
  context: ScenarioEditorContext,
): ScenarioParamsView {
  const fixture = scenarioCards
    .map((card) => context.fixtures.find((candidate) => candidate.id === card.fixtureId))
    .find(Boolean);
  const [firstDistrict] = context.districts;
  const groups = Array.from(new Set(scenarioCards.map((card) => card.group)));
  return {
    title: scenario.title,
    categories: groups,
    classifierTree: groups.flatMap((group) => context.classifierTree[group] ?? []),
    districts: context.districts,
    okrug: fixture?.address.okrug || firstDistrict.okrug,
    raion: fixture?.address.raion || firstDistrict.raions[0],
    difficulty: scenario.difficulty,
    reactionSec: scenario.timeNorms.primaryReactionSec ?? REACTION_NORM_SEC,
    processingSec: scenario.timeNorms.fullProcessingSec ?? PROCESSING_NORM_SEC,
    mode: scenario.mode ?? DEFAULT_MODE,
  };
}

/** Эталонные значения полей: Etalon.expectedFields, иначе — эталоны учебных карточек (службы, теги). */
export function buildEtalonFields(scenario: Scenario, scenarioCards: TrainingCardView[]): LabeledValue[] {
  const declared = Object.entries(scenario.etalon.expectedFields ?? {}).map(([key, value]) => ({
    id: key,
    label: key,
    value,
  }));
  if (declared.length > 0) return declared;
  return scenarioCards.flatMap((card) => [
    {
      id: `services-${card.id}`,
      label: `Службы — ${card.id} (${card.group})`,
      value: card.expectedServices.join(", "),
    },
    { id: `tags-${card.id}`, label: `Теги опросной карты — ${card.id}`, value: card.expectedTags.join("; ") },
  ]);
}

function buildQuestions(
  scenario: Scenario,
  scenarioCards: TrainingCardView[],
  context: ScenarioEditorContext,
  text: string,
): PreviewQuestion[] {
  const cardQuestions = scenarioCards.flatMap((card) => {
    const cardLabel = context.dictionary.cardLabels?.[card.id] ?? card.id;
    const actions = getCardEtalonSegment(scenario.etalon.expectedActions, card.id);
    return [
      {
        id: `q-services-${card.id}`,
        question: `Карточка ${cardLabel} «${card.summary}»: какие службы оповестить?`,
        answer: card.expectedServices.join(", "),
        phrases: [],
      },
      {
        id: `q-actions-${card.id}`,
        question: `Последовательность действий по карточке ${cardLabel}`,
        answer: actions
          .map((action) => describeEtalonAction(action, context.dictionary))
          .join(ACTION_SEPARATOR),
        phrases: [],
      },
    ];
  });
  return [
    ...cardQuestions,
    {
      id: "q-text",
      question: "Текст поля «Действие диспетчера»",
      answer: text,
      phrases: scenario.etalon.keyPhrases,
    },
  ];
}

export type ScenarioEditorModel = {
  scenarioCards: TrainingCardView[];
  params: ScenarioParamsView;
  fields: LabeledValue[];
  actions: string[];
  text: string;
  questions: PreviewQuestion[];
  validationFields: { value: string; label: string }[];
};

export function buildEditorModel(scenario: Scenario, context: ScenarioEditorContext): ScenarioEditorModel {
  const scenarioCards = getScenarioCards(scenario, context.cards);
  const text = getEtalonText(scenario.id, scenario.etalon.keyPhrases, scenario.etalon.expectedText);
  const fields = buildEtalonFields(scenario, scenarioCards);
  return {
    scenarioCards,
    params: buildParams(scenario, scenarioCards, context),
    fields,
    actions: scenario.etalon.expectedActions.map((action) =>
      describeEtalonAction(action, context.dictionary),
    ),
    text,
    questions: buildQuestions(scenario, scenarioCards, context, text),
    validationFields: [
      ...fields.map((field) => ({ value: field.id, label: field.label })),
      { value: "actions", label: "Последовательность действий" },
      { value: "text", label: "Эталонная формулировка и ключевые фразы" },
    ],
  };
}
