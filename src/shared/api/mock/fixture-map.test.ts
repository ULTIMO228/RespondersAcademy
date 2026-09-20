// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ArmCardFixture, ClassifierEntry } from "../types";
import {
  createFixtureResolver,
  DEFAULT_FIXTURE_ID,
  resolveArmFixture,
  resolveArmFixtureId,
} from "./fixture-map";
import { projectTrainingCard, resolveArmFixtureWithRule } from "./fixture-map";
import { readArmFixtures, readCards, readClassifier } from "./readers";

const TRAINING_CARD_COUNT = 96;

describe("resolveArmFixture — 96 учебных карточек", () => {
  const fixtureIds = new Set(readArmFixtures().map((fixture) => fixture.id));

  it("каждая карточка резолвится в существующую фикстуру", () => {
    const cards = readCards();
    expect(cards).toHaveLength(TRAINING_CARD_COUNT);
    for (const card of cards) expect(fixtureIds.has(resolveArmFixtureId(card))).toBe(true);
  });

  it("карточки одной группы → одна и та же фикстура", () => {
    const byGroup = new Map<string, Set<string>>();
    for (const card of readCards()) {
      const ids = byGroup.get(card.group) ?? new Set<string>();
      ids.add(resolveArmFixtureId(card));
      byGroup.set(card.group, ids);
    }
    for (const ids of byGroup.values()) expect(ids.size).toBe(1);
  });

  it("прямое совпадение группы: фикстура с classifierCode из группы карточки", () => {
    const entryByCode = new Map(readClassifier().map((entry) => [entry.code, entry]));
    const card = readCards().find((candidate) => candidate.group === "пожар в жилом доме");
    expect(card).toBeDefined();
    const resolution = resolveArmFixtureWithRule(card!);
    expect(resolution.rule).toBe("group");
    expect(entryByCode.get(resolution.fixture.what.classifierCode ?? "")?.group).toBe(card!.group);
  });

  it("c-001 («пожар на улице», фикстуры группы нет) → фикстура главной службы группы (MCHS)", () => {
    const entryByCode = new Map(readClassifier().map((entry) => [entry.code, entry]));
    const card = readCards().find((candidate) => candidate.id === "c-001")!;
    const resolution = resolveArmFixtureWithRule(card);
    expect(resolution.rule).toBe("mainService");
    expect(entryByCode.get(resolution.fixture.what.classifierCode ?? "")?.mainService).toBe("MCHS");
  });

  it("детерминизм: повторные вызовы дают тот же результат, моки не мутируются", () => {
    const snapshot = JSON.stringify(readArmFixtures());
    const first = readCards().map(resolveArmFixtureId);
    const second = readCards().map((card) => resolveArmFixture(card).id);
    expect(second).toEqual(first);
    expect(JSON.stringify(readArmFixtures())).toBe(snapshot);
  });
});

function entry(code: string, group: string, mainService: string): ClassifierEntry {
  return {
    code,
    group,
    mainService,
    sign1: "",
    sign2: "",
    sign3: "",
    extraSigns: "",
    finalType: "",
    ekp35Type: "",
    notifications: [],
  };
}

function fixture(id: string, number: number, classifierCode?: string): ArmCardFixture {
  const [base] = readArmFixtures();
  return { ...structuredClone(base), id, number, what: { ...structuredClone(base.what), classifierCode } };
}

describe("createFixtureResolver — fallback-цепочка", () => {
  const classifier = [
    entry("1", "пожар", "MCHS"),
    entry("2", "газ", "MOSGAZ"),
    entry("3", "костёр", "MCHS"),
    entry("4", "костёр", "MCHS"),
    entry("5", "костёр", "Police"),
    entry("6", "провода", "OEK"),
  ];
  const fixtures = [fixture("card-2", 2, "2"), fixture(DEFAULT_FIXTURE_ID, 3), fixture("card-1", 1, "1")];
  const resolve = createFixtureResolver({ fixtures, classifier });

  it("1) группа с прямой фикстурой", () => {
    expect(resolve("газ")).toMatchObject({ rule: "group", fixture: { id: "card-2" } });
  });

  it("2) группа без фикстуры → по доминирующему mainService группы", () => {
    expect(resolve("костёр")).toMatchObject({ rule: "mainService", fixture: { id: "card-1" } });
  });

  it("3) нет фикстуры ни группы, ни службы → дефолтная", () => {
    expect(resolve("провода")).toMatchObject({ rule: "default", fixture: { id: DEFAULT_FIXTURE_ID } });
    expect(resolve("неизвестная группа")).toMatchObject({
      rule: "default",
      fixture: { id: DEFAULT_FIXTURE_ID },
    });
  });

  it("кандидаты — по стабильному ключу (number), а не по порядку входа", () => {
    const shuffled = createFixtureResolver({ fixtures: [...fixtures].reverse(), classifier });
    expect(shuffled("костёр").fixture.id).toBe(resolve("костёр").fixture.id);
  });
});

describe("projectTrainingCard — списочная проекция учебной карточки (T1.2-04)", () => {
  const card = readCards().find((candidate) => candidate.id === "c-007")!;

  it("основа — фикстура группы, поверх — данные учебной карточки", () => {
    const fixture = resolveArmFixture(card);
    const projected = projectTrainingCard(card);
    expect(projected).toMatchObject({
      id: "c-007",
      number: 7,
      cardStatus: "registered",
      description: card.summary,
      phones: { aon: card.caller.phone, provided: card.caller.phone, onSite: "" },
      applicant: { name: card.caller.name },
      address: { formal: card.address, okrug: "", raion: "", descriptive: card.addressRefined, geo: null },
      workLines: [],
      notificationList: [],
    });
    expect(projected.what).toEqual(fixture.what);
    expect(projected.createdAt).toBe(fixture.createdAt);
    expect(projected).not.toHaveProperty("smsList");
  });

  it("эталон не переносится в проекцию; моки не мутируются", () => {
    const before = JSON.stringify(resolveArmFixture(card));
    const projected = projectTrainingCard(card);
    projected.what.signs.push("x");
    expect(JSON.stringify(resolveArmFixture(card))).toBe(before);
    expect(JSON.stringify(projected)).not.toContain("expectedServices");
  });

  it("все 96 карточек проецируются с уникальными id и номерами", () => {
    const projected = readCards().map(projectTrainingCard);
    expect(new Set(projected.map((item) => item.id)).size).toBe(TRAINING_CARD_COUNT);
    expect(new Set(projected.map((item) => item.number)).size).toBe(TRAINING_CARD_COUNT);
  });
});
