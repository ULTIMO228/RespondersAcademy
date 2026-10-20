import { describe, expect, it } from "vitest";

import { cards, reference, scenarios } from "@/shared/api";
import type { IncidentCard, Scenario } from "@/shared/api";

import { resolveExpectedCall } from "./expectedCall";

const numbers = reference.internalNumbers;
const cardOf = (cardId: string) => (cards as IncidentCard[]).find((card) => card.id === cardId) ?? null;
/* Спека 012: в эталонах датасета звонков 101–104 больше нет (это работа специалиста-112); механизм ожидаемых
 * звонков проверяется на сценарии с докладом точке C, который может задать преподаватель. */
const withPointC: Scenario[] = scenarios.map((scenario) =>
  scenario.cardIds.includes("c-095")
    ? {
        ...scenario,
        callTarget: "302",
        etalon: {
          ...scenario.etalon,
          expectedActions: ["openCard:c-095", "status:accepted", "call:301", "call:302", "status:workDone"],
        },
      }
    : scenario,
);

describe("resolveExpectedCall", () => {
  it("по эталону сценария: c-095 → звонки точке C 301, 302 из сегмента карточки", () => {
    expect(
      resolveExpectedCall({ cardId: "c-095", card: cardOf("c-095"), scenarios: withPointC, numbers }),
    ).toEqual({
      cardId: "c-095",
      numbers: ["301", "302"],
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
    const bare: Scenario[] = withPointC.map((scenario) => ({
      ...scenario,
      etalon: { ...scenario.etalon, expectedActions: [] },
    }));
    expect(resolveExpectedCall({ cardId: "c-095", card: null, scenarios: bare, numbers })).toMatchObject({
      numbers: ["302"],
      source: "callTarget",
    });
    expect(resolveExpectedCall({ cardId: "c-999", card: null, scenarios, numbers })).toBeNull();
  });
});
