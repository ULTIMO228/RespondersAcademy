/*
 * GET /api/mock/cards/[id] (T1.1-11): пространство id — по формату (TRAINING_CARD_ID / FIXTURE_CARD_ID).
 * Список GET /api/mock/cards — cards-list.ts.
 */
import type { ArmCardFixture, CardDetails, IncidentCard } from "../types";
import { resolveArmFixtureId } from "./fixture-map";
import { readArmFixtures, readCards } from "./readers";
import { notFound } from "./respond";
import { readCardRuntime } from "./store-cards";

/** Учебная карточка cards.json: "c-001" … "c-096". */
const TRAINING_CARD_ID = /^c-\d{3}$/;
/** UI-фикстура ПОВ-112: "card-881412". */
const FIXTURE_CARD_ID = /^card-/;

export type ResolvedCard =
  { kind: "fixture"; card: ArmCardFixture } | { kind: "training"; card: IncidentCard };

/** Карточка любого пространства id или undefined. */
export function findCard(cardId: string): ResolvedCard | undefined {
  if (TRAINING_CARD_ID.test(cardId)) {
    const card = readCards().find((candidate) => candidate.id === cardId);
    return card && { kind: "training", card };
  }
  if (FIXTURE_CARD_ID.test(cardId)) {
    const card = readArmFixtures().find((candidate) => candidate.id === cardId);
    return card && { kind: "fixture", card };
  }
  return undefined;
}

/** Карточка или 404 notFound. */
export function requireCard(cardId: string): ResolvedCard {
  const resolved = findCard(cardId);
  if (!resolved) throw notFound(`Карточка «${cardId}» не найдена`);
  return resolved;
}

/** GET /cards/[id]: данные моков + рантайм-мутации из store (копии, кэш ридеров не отдаётся наружу). */
export function getCardDetails(cardId: string): CardDetails {
  const resolved = requireCard(cardId);
  const runtime = readCardRuntime(cardId);
  if (resolved.kind === "fixture") {
    return { kind: "fixture", card: structuredClone(resolved.card), runtime };
  }
  return {
    kind: "training",
    card: structuredClone(resolved.card),
    resolvedFixtureId: resolveArmFixtureId(resolved.card),
    runtime,
  };
}
