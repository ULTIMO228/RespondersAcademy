import { describe, expect, it } from "vitest";

import { scenarios } from "@/shared/api";

import { buildScenarioRow } from "./buildScenarioRows";

describe("buildScenarioRow: источник сценария", () => {
  it("помечает фактический облачный источник по generation.provider", () => {
    const generated = {
      ...scenarios.find((item) => item.source === "generated")!,
      generation: { provider: "polza:qwen" },
    };

    expect(buildScenarioRow(generated, []).aiSource).toBe("cloud");
  });

  it("старый generated-сценарий без provider считает шаблонным", () => {
    const generated = { ...scenarios.find((item) => item.source === "generated")! };
    delete generated.generation;

    expect(buildScenarioRow(generated, []).aiSource).toBe("template");
  });
});
