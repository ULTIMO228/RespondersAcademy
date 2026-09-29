import { describe, expect, it } from "vitest";

import type { PublicUser, StudentProfile } from "@/shared/api";

import { mapLimit, pickRiskZone, totalTypicalErrors } from "./riskZone";

const student = (id: string, fullName: string): PublicUser => ({
  id,
  login: id,
  fullName,
  role: "student",
  armNumber: 1,
  isActive: true,
});

const profile = (dds: number[], op: number[]): StudentProfile => ({
  ratings: { dds: 1000, operator112: 1000 },
  strongerMode: null,
  typicalErrors: {
    dds: dds.map((count, index) => ({ type: `d${index}`, count })),
    operator112: op.map((count, index) => ({ type: `o${index}`, count })),
  },
  recommendations: [],
});

describe("зона риска", () => {
  it("суммирует ошибки обоих режимов", () => {
    expect(totalTypicalErrors(profile([2, 1], [4]))).toBe(7);
  });

  it("берёт трёх с наибольшим числом ошибок; равенство — по алфавиту; без ошибок не попадают", () => {
    const entries = [
      { student: student("a", "Яковлев"), errors: 5 },
      { student: student("b", "Абрамов"), errors: 5 },
      { student: student("c", "Борисов"), errors: 9 },
      { student: student("d", "Виноградов"), errors: 1 },
      { student: student("e", "Григорьев"), errors: 0 },
    ];
    expect(pickRiskZone(entries).map((entry) => entry.student.id)).toEqual(["c", "b", "a"]);
    expect(pickRiskZone([entries[4]])).toEqual([]);
  });
});

describe("mapLimit", () => {
  it("не превышает лимит параллелизма, сохраняет порядок и частичные ошибки", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (value) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      if (value === 3) throw new Error("boom");
      return value * 10;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((item) => (item.status === "fulfilled" ? item.value : "err"))).toEqual([
      10,
      20,
      "err",
      40,
      50,
      60,
    ]);
  });
});
