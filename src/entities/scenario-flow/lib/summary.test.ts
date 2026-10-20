import { describe, expect, it } from "vitest";

import type { FlowDictionaries } from "../model/types";
import { createDemoGraph } from "./demo";
import { HIDDEN_ANSWER, summarizeNode } from "./summary";

const dict: FlowDictionaries = { cards: [], ddsStatuses: [], services: [], phoneNumbers: [], signs: [] };

const demo = createDemoGraph();
const byField = (field: string) =>
  demo.nodes.find((node) => node.type === "requiredQuestion" && node.props.field === field)!;
const gasCheck = demo.nodes.find((node) => node.type === "condition" && node.props.check === "field")!;

describe("summarizeNode", () => {
  it("обязательный вопрос описан явно: что выяснить и какой ответ верный", () => {
    expect(summarizeNode(byField("addressRefined"), dict)).toBe(
      "Выяснить: Уточнение адреса. Ответ: «ул. Грина, 11» · 3 балла · критично",
    );
  });

  it("со скрытыми ответами правильный ответ не попадает в текст ни вопроса, ни условия", () => {
    const question = summarizeNode(byField("addressRefined"), dict, new Map(), { hideAnswers: true });
    expect(question).toContain(HIDDEN_ANSWER);
    expect(question).not.toContain("Грина");
    const condition = summarizeNode(gasCheck, dict, new Map(), { hideAnswers: true });
    expect(condition).toContain(HIDDEN_ANSWER);
    expect(condition).not.toContain("«да»");
  });

  it("без скрытия условие показывает ожидаемое значение (парный случай)", () => {
    expect(summarizeNode(gasCheck, dict)).toContain("«да»");
  });
});
