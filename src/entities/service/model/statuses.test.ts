import referenceJson from "@mocks/reference.json";
import { describe, expect, it } from "vitest";

import type { ReferenceData } from "@/shared/api";

import { createDdsStatusMachine, createServiceStatusMachine } from "./statuses";

const reference = referenceJson as ReferenceData;

describe("createDdsStatusMachine", () => {
  const machine = createDdsStatusMachine(reference.ddsStatuses);

  it("старт — строго «Принята» / «Не принята»", () => {
    expect(machine.nextStatuses(null)).toEqual(["accepted", "notAccepted"]);
  });

  it("проходит полный цикл памятки по данным справочника", () => {
    const cycle = ["accepted", "responseStarted", "arrived", "workInProgress", "workDone"] as const;
    let current: (typeof cycle)[number] | null = null;
    for (const status of cycle) {
      expect(() => machine.assertTransition(current, status)).not.toThrow();
      current = status;
    }
  });

  it("notAccepted без комментария — отказ, после него доступна только «Принята»", () => {
    expect(() => machine.assertTransition(null, "notAccepted")).toThrow("обязателен комментарий");
    expect(machine.nextStatuses("notAccepted")).toEqual(["accepted"]);
  });
});

describe("createServiceStatusMachine", () => {
  const machine = createServiceStatusMachine(reference.serviceStatuses);

  it("строится из 9 статусов reference.json, старт — «Добавлена»", () => {
    expect(machine.statuses).toHaveLength(9);
    expect(machine.nextStatuses(null)).toEqual(["added"]);
    expect(machine.canTransition("received", "notAccepted")).toBe(true);
    expect(machine.canTransition("workDone", "accepted")).toBe(false);
  });
});
