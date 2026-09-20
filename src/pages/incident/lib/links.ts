import type { LinkedCard } from "@/widgets/incident-card";
import type { CardDetails, CardLink } from "@/shared/api";

import { FIXTURE_LINK_CHAINS } from "../model/constants";

const ROLE_TITLES: Record<CardLink["role"], LinkedCard["role"]> = {
  main: "главная",
  subordinate: "подчинённая",
};

const TRAINING_ID_DIGITS = /\d+/;

/** Цепочка связей карточки: мок-слой (учебные карточки, duplicateOf) или статичная цепочка фикстур. */
export function resolveLinkChain(cardId: string, chain: CardLink[]): CardLink[] {
  if (chain.length > 0) return chain;
  const fixtureChain = FIXTURE_LINK_CHAINS.find(
    (item) => item.main === cardId || item.subordinates.includes(cardId),
  );
  if (!fixtureChain) return [];
  return [
    { cardId: fixtureChain.main, role: "main" },
    ...fixtureChain.subordinates.map((id): CardLink => ({ cardId: id, role: "subordinate" })),
  ];
}

/** Звено цепочки → строка блока «Связи» (номер и тип — из данных связанной карточки). */
export function toLinkedCard(link: CardLink, details: CardDetails | undefined): LinkedCard {
  if (details?.kind === "fixture") {
    return {
      id: link.cardId,
      number: details.card.number,
      role: ROLE_TITLES[link.role],
      finalType: details.card.what.finalType,
    };
  }
  return {
    id: link.cardId,
    number: Number(TRAINING_ID_DIGITS.exec(link.cardId)?.[0] ?? 0),
    role: ROLE_TITLES[link.role],
    finalType: details?.kind === "training" ? details.card.group : "",
  };
}
