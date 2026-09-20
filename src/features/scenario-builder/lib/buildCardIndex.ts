import type { ArmCardFixture, ClassifierEntry, IncidentCard } from "@/shared/api";

import type { TrainingCardView } from "../model/types";
import { matchClassifierEntries } from "./classifierMatch";

/**
 * Выжимка по 96 учебным карточкам для конструктора сценариев: группа ЕКП, фабула, итоговые типы
 * (матрица `classifier.json`), эталонные службы и теги, id фикстуры ПОВ-112 для предпросмотра.
 * Считается серверным компонентом страницы: сам классификатор в браузер не уезжает.
 */
export function buildCardIndex(
  cards: readonly IncidentCard[],
  classifier: readonly ClassifierEntry[],
  resolveFixtureId?: (cardId: string) => string | undefined,
): TrainingCardView[] {
  return cards.map((card) => {
    const view: TrainingCardView = {
      id: card.id,
      ticketNo: card.ticketNo,
      group: card.group,
      summary: card.summary,
      finalTypes: Array.from(
        new Set(matchClassifierEntries(card, classifier).map((entry) => entry.finalType)),
      ),
      expectedServices: [...card.expectedServices],
      expectedTags: [...card.expectedTags],
    };
    const fixtureId = resolveFixtureId?.(card.id);
    if (fixtureId) view.fixtureId = fixtureId;
    return view;
  });
}

/** Карточки-шаблоны для диалога «Создать сценарий» (c-001…c-096). */
export function buildTemplateOptions(cards: readonly TrainingCardView[]) {
  return cards.map((card) => ({ value: card.id, label: `${card.id} · ${card.group} — ${card.summary}` }));
}

/** Фикстура ПОВ-112 карточки-основы сценария (первая карточка с сопоставленной фикстурой). */
export function findBaseFixture(
  cards: readonly TrainingCardView[],
  fixtures: readonly ArmCardFixture[],
): { card: TrainingCardView; fixture: ArmCardFixture } | null {
  for (const card of cards) {
    const fixture = fixtures.find((candidate) => candidate.id === card.fixtureId);
    if (fixture) return { card, fixture };
  }
  return null;
}
