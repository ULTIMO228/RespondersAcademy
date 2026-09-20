import { describe, expect, it } from "vitest";

import { armCardFixtures, reference } from "@/shared/api";

import { buildServiceTiles, toServiceHistory } from "./serviceTiles";

describe("buildServiceTiles", () => {
  it("строит плитки в порядке списка оповещения со строкой статуса", () => {
    const card = armCardFixtures[0];
    const tiles = buildServiceTiles({
      services: reference.services,
      serviceStatuses: reference.serviceStatuses,
      history: toServiceHistory(card),
      order: card.notificationList.map((entry) => entry.serviceId),
      mainServiceIds: ["svc-upr-chert"],
    });
    expect(tiles[0]).toMatchObject({
      name: "Упр. Чертаново Южное",
      statusLine: "15:40 Работы завершены",
      isMain: true,
    });
    expect(tiles[1]).toMatchObject({ name: "Преф. ЮАО", statusLine: "11:59 Добавлена", isPhoneOnly: false });
  });
});
