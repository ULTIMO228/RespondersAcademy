import type { ClassifierEntry } from "@/shared/api";

function entry(
  code: string,
  group: string,
  signs: [string, string, string],
  finalType: string,
): ClassifierEntry {
  return {
    code,
    group,
    sign1: signs[0],
    sign2: signs[1],
    sign3: signs[2],
    extraSigns: "",
    finalType,
    ekp35Type: finalType,
    mainService: "MCHS",
    notifications: [],
  };
}

/** Мини-классификатор для тестов: две группы, у «пожара в жилом доме» — ветвление на втором и третьем признаках. */
export const TEST_ENTRIES: ClassifierEntry[] = [
  entry("1050201", "пожар в жилом доме", ["жилой дом", "балкон", "открытое пламя"], "пожар: балкон"),
  entry("1050202", "пожар в жилом доме", ["жилой дом", "балкон", "дым"], "пожар: балкон (дым)"),
  entry("1050301", "пожар в жилом доме", ["жилой дом", "кухня", "открытое пламя"], "пожар: кухня"),
  entry("1010101", "пожар на улице", ["на улице", "мусор", "открытое пламя"], "пожар: мусор"),
  entry("2010101", "ДТП", ["дорога", "", ""], "ДТП"),
];
