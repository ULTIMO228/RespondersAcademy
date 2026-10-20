import { describe, expect, it } from "vitest";

import { buildChips, buildGreeting, GENERAL_CHIP } from "./chips";

const err = (type: string, message = "Сообщение") => ({ type, message });

describe("чипы вопросов", () => {
  it("время и служба дают свои чипы, общий — последним", () => {
    const chips = buildChips({
      totalScore: 70,
      errors: [err("timeReactionExceeded"), err("wrongRecipient")],
    });
    expect(chips).toEqual([
      "Почему превышен норматив времени?",
      "Почему важно передать информацию нужной службе?",
      GENERAL_CHIP,
    ]);
    expect(chips.at(-1)).toBe(GENERAL_CHIP);
  });

  it("нет нарушений — только общий чип", () => {
    expect(buildChips({ totalScore: 100, errors: [] })).toEqual([GENERAL_CHIP]);
  });

  it("не больше трёх; прочее нарушение превращается в вопрос по его формулировке", () => {
    const chips = buildChips({
      totalScore: 50,
      errors: [err("addressMissing", "Не указан номер дома"), err("noContact", "Нет связи"), err("x", "Ещё")],
    });
    expect(chips).toEqual([
      "Что значит замечание: «Не указан номер дома»?",
      "Что значит замечание: «Нет связи»?",
      GENERAL_CHIP,
    ]);
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(chips.at(-1)).toBe(GENERAL_CHIP);
  });

  it("слишком длинная формулировка в чип не идёт", () => {
    expect(buildChips({ totalScore: 60, errors: [err("addressMissing", "а".repeat(200))] })).toEqual([
      GENERAL_CHIP,
    ]);
  });
});

describe("приветствие", () => {
  it("балл и число замечаний со склонением", () => {
    expect(buildGreeting({ totalScore: 82, errors: [err("a"), err("b")] })).toBe(
      "Здравствуйте! В этой попытке вы набрали 82 балла, зафиксировано 2 замечания. Задайте вопрос по любому пункту разбора.",
    );
    expect(buildGreeting({ totalScore: 91, errors: [err("a")] })).toContain(
      "91 балл, зафиксировано 1 замечание",
    );
    expect(buildGreeting({ totalScore: 100, errors: [] })).toContain(
      "100 баллов, замечаний не зафиксировано",
    );
    expect(buildGreeting({ totalScore: 11, errors: Array.from({ length: 5 }, () => err("a")) })).toContain(
      "11 баллов, зафиксировано 5 замечаний",
    );
  });
});
