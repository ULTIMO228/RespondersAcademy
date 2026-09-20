import { describe, expect, it } from "vitest";

import { cards, reference, scenarios } from "@/shared/api";
import type { IncidentCard, Scenario } from "@/shared/api";

import { resolveExpectedCall } from "./expectedCall";

const numbers = reference.internalNumbers;
const cardOf = (cardId: string) => (cards as IncidentCard[]).find((card) => card.id === cardId) ?? null;

describe("resolveExpectedCall", () => {
  it("по эталону сценария: c-095 → звонки 103, 102, 101 из сегмента карточки", () => {
    expect(resolveExpectedCall({ cardId: "c-095", card: cardOf("c-095"), scenarios, numbers })).toEqual({
      cardId: "c-095",
      numbers: ["103", "102", "101"],
      source: "etalon",
    });
  });

  it("без звонков в эталоне — главная служба карточки («(главная)» в expectedServices)", () => {
    const withoutCalls: Scenario[] = scenarios.map((scenario) => ({
      ...scenario,
      etalon: { ...scenario.etalon, expectedActions: [] },
    }));
    expect(
      resolveExpectedCall({ cardId: "c-093", card: cardOf("c-093"), scenarios: withoutCalls, numbers }),
    ).toEqual({ cardId: "c-093", numbers: ["104"], source: "mainService" });
  });

  it("fallback — Scenario.callTarget; карточка вне сценариев — null", () => {
    const bare: Scenario[] = scenarios.map((scenario) => ({
      ...scenario,
      etalon: { ...scenario.etalon, expectedActions: [] },
    }));
    expect(resolveExpectedCall({ cardId: "c-095", card: null, scenarios: bare, numbers })).toMatchObject({
      numbers: ["102"],
      source: "callTarget",
    });
    expect(resolveExpectedCall({ cardId: "c-999", card: null, scenarios, numbers })).toBeNull();
  });
});
