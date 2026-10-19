import { describe, expect, it } from "vitest";

import { groupMapHref, journalHref, presentHref, studentMapHref } from "./links";

const filters = { groupId: "g-1", period: "2w", mode: "operator112" } as const;

describe("ссылки карты ошибок", () => {
  it("на обучающегося: фильтры, стартовый этап и from", () => {
    expect(studentMapHref("u 1", filters, "address")).toBe(
      "/teacher/error-map/students/u%201?group=g-1&period=2w&mode=operator112&stage=address&from=address",
    );
  });

  it("на обучающегося без этапа: только фильтры", () => {
    expect(studentMapHref("u-1", filters)).toBe(
      "/teacher/error-map/students/u-1?group=g-1&period=2w&mode=operator112",
    );
  });

  it("на группу: фильтры и этап", () => {
    expect(groupMapHref(filters, "address")).toBe(
      "/teacher/error-map?group=g-1&period=2w&mode=operator112&stage=address",
    );
    expect(groupMapHref({ ...filters, groupId: "" })).toBe("/teacher/error-map?period=2w&mode=operator112");
  });

  it("на журнал: группа в пути, period и mode в query", () => {
    expect(journalHref(filters)).toBe("/teacher/error-map/g-1/journal?period=2w&mode=operator112");
    expect(journalHref({ ...filters, groupId: "ДДС 01" })).toBe(
      "/teacher/error-map/%D0%94%D0%94%D0%A1%2001/journal?period=2w&mode=operator112",
    );
  });

  it("на показ: группа в пути, шаг и вид-источник в query", () => {
    expect(presentHref(filters)).toBe("/teacher/error-map/g-1/present?period=2w&mode=operator112");
    expect(presentHref(filters, { step: 2 })).toBe(
      "/teacher/error-map/g-1/present?period=2w&mode=operator112&step=2",
    );
    expect(presentHref(filters, { step: 1, view: "journal" })).toBe(
      "/teacher/error-map/g-1/present?period=2w&mode=operator112&step=1&view=journal",
    );
    expect(presentHref(filters, { view: "map" })).toBe(
      "/teacher/error-map/g-1/present?period=2w&mode=operator112",
    );
  });
});
