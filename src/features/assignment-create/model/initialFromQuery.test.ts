import { describe, expect, it } from "vitest";

import { ROUTES } from "@/shared/config";

import { assignmentPrefillFromQuery } from "./initialFromQuery";

/** Ссылка из карты ошибок → URL → query страницы: проверяет, что имена параметров совпадают на обоих концах. */
const queryOf = (href: string): Record<string, string | string[]> =>
  Object.fromEntries(new URL(href, "http://localhost").searchParams.entries());

describe("assignmentPrefillFromQuery", () => {
  it("круг «хелпер ссылки → query → разбор» сохраняет обучающихся, режим, название и этап", () => {
    const href = ROUTES.teacherAssignmentNewPrefilled({
      studentIds: ["u-005", "u-006"],
      mode: "dds",
      title: "Тренировка: «Пожар» №1",
      focusStage: "Пожар, ДТП",
    });
    expect(assignmentPrefillFromQuery(queryOf(href))).toEqual({
      initial: {
        studentIds: ["u-005", "u-006"],
        trainingMode: "dds",
        title: "Тренировка: «Пожар» №1",
      },
      focusStage: "Пожар, ДТП",
    });
  });

  it("режим: пропускаются всё, кроме operator112 и dds (цепочка и мусор — без предвыбора)", () => {
    expect(assignmentPrefillFromQuery({ mode: "chain" }).initial.trainingMode).toBeUndefined();
    expect(assignmentPrefillFromQuery({ mode: "exam" }).initial.trainingMode).toBeUndefined();
    expect(assignmentPrefillFromQuery({ mode: "operator112" }).initial.trainingMode).toBe("operator112");
    expect(assignmentPrefillFromQuery({ mode: "dds" }).initial.trainingMode).toBe("dds");
  });

  it("обучающиеся: список через запятую и повторяющиеся ключи, пробелы и дубликаты убираются", () => {
    expect(
      assignmentPrefillFromQuery({ studentIds: [" u-005, u-006 ,,", "u-005"] }).initial.studentIds,
    ).toEqual(["u-005", "u-006"]);
  });

  it("пустые значения не попадают в начальные значения; без query — пустой предвыбор", () => {
    expect(assignmentPrefillFromQuery({ title: "   ", focusStage: "", mode: undefined })).toEqual({
      initial: { studentIds: [], trainingMode: undefined, title: undefined },
      focusStage: undefined,
    });
  });

  it("повторяющийся title берёт первое значение", () => {
    expect(assignmentPrefillFromQuery({ title: ["Первое", "Второе"] }).initial.title).toBe("Первое");
  });
});
