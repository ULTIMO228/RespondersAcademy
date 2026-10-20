import { describe, expect, it } from "vitest";

import { mapArmFixture } from "@/entities/incident";
import { armCardFixtures, reference } from "@/shared/api";
import type { ArmCardFixtureContract, ReferenceData } from "@/shared/api";

import { buildMapContext } from "./mapContext";

const data = reference as unknown as ReferenceData;

describe("журнал: своя служба обучающегося (спека 012 FR-007)", () => {
  it("egorov — «Упр. Обручевский», petrova — «Упр. Чертаново Южное»", () => {
    expect(buildMapContext(data, "ДДС района Обручевский").myServiceId).toBe("svc-upr-obruchev");
    expect(buildMapContext(data, "ДДС района Чертаново Южное").myServiceId).toBe("svc-upr-chert");
  });

  it("своей службы нет в списке оповещения — «Статус службы» её («Добавлена»), а не первой службы списка", () => {
    const fixture = armCardFixtures.find(
      (card) =>
        !card.notificationList.some((entry) => entry.serviceId === "svc-upr-obruchev") &&
        card.notificationList[0]?.statuses.at(-1)?.status !== "added",
    );
    if (!fixture) throw new Error("Нет фикстуры без «Упр. Обручевский» со статусом первой службы ≠ added");
    const row = mapArmFixture(
      fixture as unknown as ArmCardFixtureContract,
      buildMapContext(data, "ДДС района Обручевский"),
    );
    expect(row.serviceStatus.code).toBe("added");
  });
});
