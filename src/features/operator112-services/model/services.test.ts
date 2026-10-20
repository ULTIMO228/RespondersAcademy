import { describe, expect, it } from "vitest";

import type { NotificationListItem } from "@/shared/api";

import { serviceOptions, tileTitle, uniqueServices } from "./services";

const item = (serviceId: string, title: string, condition?: string): NotificationListItem => ({
  serviceId,
  title,
  addedBy: "auto",
  condition,
});

describe("службы панели", () => {
  it("tileTitle убирает пояснение в скобках", () => {
    expect(tileTitle("Служба 101 (МЧС)")).toBe("Служба 101");
    expect(tileTitle("ЦЭМП")).toBe("ЦЭМП");
    expect(tileTitle("(без имени)")).toBe("(без имени)");
  });

  it("одна служба с разными условиями показывается один раз", () => {
    const list = [item("svc-101", "Служба 101", "a"), item("svc-101", "Служба 101", "b")];
    expect(uniqueServices(list)).toHaveLength(1);
  });

  it("окно: выбранные сначала, уже выбранная условная не дублируется, поиск по словам", () => {
    const services = [item("svc-101", "Служба 101 (МЧС)")];
    const conditional = [item("svc-103", "СМП (Служба 103)"), item("svc-101", "Служба 101 (МЧС)")];
    expect(serviceOptions(services, conditional, "")).toEqual([
      { serviceId: "svc-101", title: "Служба 101 (МЧС)", isListed: true },
      { serviceId: "svc-103", title: "СМП (Служба 103)", isListed: false },
    ]);
    expect(serviceOptions(services, conditional, "смп").map((o) => o.serviceId)).toEqual(["svc-103"]);
  });
});
