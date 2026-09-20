import { describe, expect, it } from "vitest";

import { checkGrammarFields, checkGrammarText } from "./index";

describe("checkGrammarText (мок ИИ)", () => {
  it("находит орфографические ошибки из словаря с фрагментом контекста", () => {
    expect(checkGrammarText("Сообщение пренято, механик напрален", "dispatcherAction")).toEqual([
      {
        field: "dispatcherAction",
        fragment: "Сообщение пренято",
        wrong: "пренято",
        expected: "принято",
        type: "spelling",
      },
      {
        field: "dispatcherAction",
        fragment: "механик напрален",
        wrong: "напрален",
        expected: "направлен",
        type: "spelling",
      },
    ]);
  });

  it("синтаксис: строчная буква в начале, двойной пробел, пробел перед запятой", () => {
    const issues = checkGrammarText("наряд  направлен , ожидаем");
    expect(issues.map((issue) => [issue.type, issue.wrong, issue.expected])).toEqual([
      ["syntax", "наряд", "Наряд"],
      ["syntax", "  ", " "],
      ["syntax", " ,", ","],
    ]);
  });

  it("чистый текст и пустая строка — без ошибок", () => {
    expect(checkGrammarText("Сообщение принято, наряд полиции направлен")).toEqual([]);
    expect(checkGrammarText("   ")).toEqual([]);
  });

  it("детерминирован и проверяет все поля ввода", () => {
    const fields = { dispatcherAction: "Бригадда направлена", outfitNumber: "5" };
    expect(checkGrammarFields(fields)).toEqual(checkGrammarFields(fields));
    expect(checkGrammarFields(fields)).toHaveLength(1);
  });
});
