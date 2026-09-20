import { describe, expect, it } from "vitest";

import { classifier } from "@/shared/api";

import { buildQuestionGroups, DEFAULT_QUESTIONNAIRE_TITLE, getQuestionnaireTitle } from "./questionGroups";

const fireEntries = classifier.filter((entry) => entry.group === "пожар в жилом доме");

describe("buildQuestionGroups", () => {
  it("строит группы из записей классификатора и отмечает выбранные признаки", () => {
    const groups = buildQuestionGroups(fireEntries, "1050101", []);
    expect(groups[0].question).toBe("112-Признак.1");
    expect(groups[0].selected).toEqual(["жилой дом"]);
    expect(groups[2].selected).toContain("открытое пламя");
  });
});

describe("getQuestionnaireTitle", () => {
  it("по главной службе", () => {
    expect(getQuestionnaireTitle("MCHS")).toBe("Происшествие 101");
    expect(getQuestionnaireTitle("")).toBe(DEFAULT_QUESTIONNAIRE_TITLE);
  });
});
