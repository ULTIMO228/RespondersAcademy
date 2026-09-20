import referenceJson from "@mocks/reference.json";
import { describe, expect, it } from "vitest";

import type { ReferenceData } from "@/shared/api";

import { canSubmitStatus, getStatusOptions, isClosingStatus } from "./statusOptions";

const { ddsStatuses } = referenceJson as ReferenceData;

function availableTitles(currentStatus: string | null): string[] {
  return getStatusOptions({ ddsStatuses, currentStatus })
    .filter((option) => option.isAvailable)
    .map((option) => option.title);
}

describe("getStatusOptions (граф reference.ddsStatuses)", () => {
  it("старт — только «Принята» / «Не принята» (в т.ч. при статусах службы added/received)", () => {
    expect(availableTitles(null)).toEqual(["Принята", "Не принята"]);
    expect(availableTitles("added")).toEqual(["Принята", "Не принята"]);
    expect(availableTitles("received")).toEqual(["Принята", "Не принята"]);
  });

  it("после «Не принята» — только «Принята»", () => {
    expect(availableTitles("notAccepted")).toEqual(["Принята"]);
  });

  it("полный цикл памятки идёт строго по графу; все пункты видны", () => {
    expect(getStatusOptions({ ddsStatuses, currentStatus: "accepted" })).toHaveLength(ddsStatuses.length);
    expect(availableTitles("accepted")).toEqual(["Начало реагирования"]);
    expect(availableTitles("responseStarted")).toEqual(["Прибытие"]);
    expect(availableTitles("arrived")).toEqual(["Проведение работ"]);
    expect(availableTitles("workInProgress")).toEqual(["Работы завершены", "Отказ от выполнения работ"]);
    expect(availableTitles("workDone")).toEqual([]);
  });

  it("финальные статусы закрывают карточку", () => {
    const finals = getStatusOptions({ ddsStatuses, currentStatus: null }).filter((option) => option.isFinal);
    expect(finals.map((option) => option.status)).toEqual(["workDone", "workRefused"]);
    expect(isClosingStatus(ddsStatuses, "workRefused")).toBe(true);
    expect(isClosingStatus(ddsStatuses, "accepted")).toBe(false);
  });
});

describe("canSubmitStatus", () => {
  const options = getStatusOptions({ ddsStatuses, currentStatus: null });

  it("«Не принята» без комментария не сохраняется", () => {
    expect(canSubmitStatus({ status: "notAccepted", dutyNumber: "", comment: " " }, options)).toBe(false);
    expect(
      canSubmitStatus({ status: "notAccepted", dutyNumber: "", comment: "вне компетенции" }, options),
    ).toBe(true);
  });

  it("недоступный статус не сохраняется", () => {
    expect(canSubmitStatus({ status: "workDone", dutyNumber: "", comment: "" }, options)).toBe(false);
  });
});
