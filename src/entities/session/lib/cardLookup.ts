import type { ArmCardFixture, TrainingCard } from "@/shared/api";

import { TRAINING_CARD_FIXTURE_IDS } from "../config/cardFixtures";

export type CardCaption = {
  /** Номер для UI: номер ПОВ-112 «36814850» или id учебной карточки «c-094». */
  number: string;
  /** Тип: итоговый тип фикстуры или группа учебной карточки. */
  type: string;
};

export function findCardFixture(cardId: string, fixtures: ArmCardFixture[]): ArmCardFixture | undefined {
  const fixtureId = TRAINING_CARD_FIXTURE_IDS[cardId];
  return fixtureId ? fixtures.find((fixture) => fixture.id === fixtureId) : undefined;
}

/** Подпись карточки «№ + тип» для плиток, ленты, очереди и отчётов. */
export function getCardCaption(
  cardId: string,
  cards: TrainingCard[],
  fixtures: ArmCardFixture[],
): CardCaption {
  const fixture = findCardFixture(cardId, fixtures);
  if (fixture) return { number: String(fixture.number), type: fixture.what.finalType };
  const card = cards.find((trainingCard) => trainingCard.id === cardId);
  return { number: cardId, type: card?.group ?? "—" };
}
