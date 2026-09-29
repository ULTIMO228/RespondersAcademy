import { describe, expect, it } from "vitest";

import { TEST_ENTRIES } from "./fixtures";
import {
  EMPTY_SELECTION,
  entriesFor,
  listGroups,
  resolveEntry,
  restoreSelection,
  selectSign,
  visibleLevels,
} from "./tree";

const GROUP = "пожар в жилом доме";

describe("дерево опросной карты", () => {
  it("группы — по порядку классификатора, без повторов", () => {
    expect(listGroups(TEST_ENTRIES)).toEqual(["пожар в жилом доме", "пожар на улице", "ДТП"]);
  });

  it("без группы уровней нет; после группы показывается первый уровень", () => {
    expect(visibleLevels(TEST_ENTRIES, EMPTY_SELECTION)).toEqual([]);
    const levels = visibleLevels(TEST_ENTRIES, { group: GROUP, signs: [] });
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({
      level: 0,
      title: "112-Признак.1",
      options: ["жилой дом"],
      selected: null,
    });
  });

  it("варианты следующего уровня зависят от выбранных: балкон → открытое пламя / дым", () => {
    const levels = visibleLevels(TEST_ENTRIES, { group: GROUP, signs: ["жилой дом", "балкон"] });
    expect(levels.map((level) => level.options)).toEqual([
      ["жилой дом"],
      ["балкон", "кухня"],
      ["открытое пламя", "дым"],
    ]);
    expect(levels[2].selected).toBeNull();
  });

  it("строка ЕКП определяется только когда выбор однозначен", () => {
    expect(resolveEntry(TEST_ENTRIES, { group: GROUP, signs: ["жилой дом", "балкон"] })).toBeUndefined();
    expect(resolveEntry(TEST_ENTRIES, { group: GROUP, signs: ["жилой дом", "балкон", "дым"] })?.code).toBe(
      "1050202",
    );
    // Группа без второго и третьего уровня: одного признака достаточно.
    expect(resolveEntry(TEST_ENTRIES, { group: "ДТП", signs: ["дорога"] })?.code).toBe("2010101");
  });

  it("повторный клик снимает признак и все последующие; смена уровня обрезает хвост", () => {
    const full = { group: GROUP, signs: ["жилой дом", "балкон", "дым"] };
    expect(selectSign(full, 1, "балкон").signs).toEqual(["жилой дом"]);
    expect(selectSign(full, 1, "кухня").signs).toEqual(["жилой дом", "кухня"]);
    expect(selectSign({ group: GROUP, signs: [] }, 0, "жилой дом").signs).toEqual(["жилой дом"]);
  });

  it("entriesFor фильтрует по группе и префиксу признаков", () => {
    expect(entriesFor(TEST_ENTRIES, { group: GROUP, signs: ["жилой дом", "кухня"] })).toHaveLength(1);
    expect(entriesFor(TEST_ENTRIES, { group: "", signs: [] })).toEqual([]);
  });

  it("восстановление выбора после перезагрузки: группа находится по первому совпавшему признаку", () => {
    expect(restoreSelection(TEST_ENTRIES, ["на улице", "мусор"])).toEqual({
      group: "пожар на улице",
      signs: ["на улице", "мусор"],
    });
    expect(restoreSelection(TEST_ENTRIES, [])).toEqual(EMPTY_SELECTION);
    expect(restoreSelection(TEST_ENTRIES, ["нет такого"])).toEqual(EMPTY_SELECTION);
  });
});
