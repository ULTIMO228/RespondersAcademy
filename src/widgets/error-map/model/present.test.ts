import { describe, expect, it } from "vitest";

import type { ErrorMapHeadline } from "@/shared/api";

import { parseStep, presentStageIds, presentTotal } from "./present";

describe("шаги режима показа", () => {
  it("вывод + по шагу на каждый проблемный этап", () => {
    const problems: ErrorMapHeadline = { kind: "problems", stageIds: ["address", "services"], text: "…" };
    expect(presentStageIds(problems)).toEqual(["address", "services"]);
    expect(presentTotal(problems)).toBe(3);
  });

  it("без проблем (нет проблем или мало данных) — один шаг с выводом", () => {
    expect(presentTotal({ kind: "clean", stageIds: [], text: "Критичных проблем нет" })).toBe(1);
    expect(presentTotal({ kind: "noData", stageIds: [], text: "Данных пока мало" })).toBe(1);
    expect(presentStageIds({ kind: "noData", stageIds: ["x"], text: "" })).toEqual([]);
  });

  it("шаг из query: с 1, мусор и выход за границы заменяются допустимым", () => {
    expect(parseStep("2", 3)).toBe(2);
    expect(parseStep(null, 3)).toBe(1);
    expect(parseStep(undefined, 3)).toBe(1);
    expect(parseStep("abc", 3)).toBe(1);
    expect(parseStep("0", 3)).toBe(1);
    expect(parseStep("-4", 3)).toBe(1);
    expect(parseStep("9", 3)).toBe(3);
    expect(parseStep("2", 1)).toBe(1);
  });
});
