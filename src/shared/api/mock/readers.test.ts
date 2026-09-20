// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  readArmFixtures,
  readCards,
  readClassifier,
  readClassifierMeta,
  readGroupReport,
  readReference,
  readReports,
  readScenarios,
  readSessions,
  readUsers,
} from "./readers";

const TRAINING_CARD_COUNT = 96;
const CLASSIFIER_ENTRY_COUNT = 1283;
const ARM_FIXTURE_COUNT = 12;
const USER_COUNT = 24;
const SCENARIO_COUNT = 36;
const REFERENCE_COLLECTION_KEYS = [
  "ddsStatuses",
  "serviceStatuses",
  "callerStatuses",
  "channels",
  "services",
  "incidentGroups",
  "classifierRows",
  "cardStatuses",
  "districts",
  "sources",
  "internalNumbers",
];

describe("ридеры мок-слоя: объёмы и форматы id", () => {
  it("readCards → ровно 96 учебных карточек c-001..c-096 по порядку", () => {
    const cards = readCards();
    expect(cards).toHaveLength(TRAINING_CARD_COUNT);
    cards.forEach((card, index) => {
      expect(card.id).toBe(`c-${String(index + 1).padStart(3, "0")}`);
    });
  });

  it("readClassifier → 1283 записи, совпадает с meta.rowCount", () => {
    expect(readClassifier()).toHaveLength(CLASSIFIER_ENTRY_COUNT);
    expect(readClassifierMeta().rowCount).toBe(CLASSIFIER_ENTRY_COUNT);
    expect(readClassifier().every((entry) => !("responseScenario" in entry))).toBe(true);
  });

  it("readArmFixtures → 12 фикстур с id card-* и числовым номером", () => {
    const fixtures = readArmFixtures();
    expect(fixtures).toHaveLength(ARM_FIXTURE_COUNT);
    fixtures.forEach((fixture) => {
      expect(fixture.id).toMatch(/^card-\d+$/);
      expect(fixture.id).toBe(`card-${fixture.number}`);
    });
  });

  it("readUsers → 24 учётки u-XXX, роли из union Role", () => {
    const users = readUsers();
    expect(users).toHaveLength(USER_COUNT);
    users.forEach((user) => {
      expect(user.id).toMatch(/^u-\d{3}$/);
      expect(["student", "teacher", "admin"]).toContain(user.role);
    });
  });

  it("readScenarios → 36 сценариев s-XXX", () => {
    expect(readScenarios()).toHaveLength(SCENARIO_COUNT);
    readScenarios().forEach((scenario) => expect(scenario.id).toMatch(/^s-\d{3}$/));
  });

  it("readSessions/readReports/readGroupReport ссылаются на существующие занятия", () => {
    const sessionIds = new Set(readSessions().map((session) => session.id));
    readReports().forEach((report) => expect(sessionIds.has(report.sessionId)).toBe(true));
    expect(sessionIds.has(readGroupReport().sessionId)).toBe(true);
  });

  it("readReference → 11 коллекций справочника", () => {
    const reference = readReference();
    REFERENCE_COLLECTION_KEYS.forEach((key) => expect(reference).toHaveProperty(key));
  });
});

describe("ридеры мок-слоя: соответствие значений контрактным union-типам", () => {
  const reference = readReference();
  const ddsStatuses = new Set<string>(reference.ddsStatuses.map((def) => def.status));
  const serviceStatuses = new Set<string>(reference.serviceStatuses.map((def) => def.status));
  const cardStatuses = new Set<string>(reference.cardStatuses.map((def) => def.status));

  it("статусы ДДС попыток — из reference.ddsStatuses", () => {
    const marks = readSessions().flatMap((session) => session.cardEvents.flatMap((event) => event.statuses));
    marks.forEach((mark) => expect(ddsStatuses.has(mark.ddsStatus)).toBe(true));
  });

  it("статусы служб и карточек фикстур — из reference", () => {
    readArmFixtures().forEach((fixture) => {
      expect(cardStatuses.has(fixture.cardStatus)).toBe(true);
      fixture.notificationList
        .flatMap((entry) => entry.statuses)
        .forEach((event) => expect(serviceStatuses.has(event.status)).toBe(true));
    });
  });

  it("serviceStatuses фактически 9 (расхождение №2 со спекой, union покрывает)", () => {
    expect(reference.serviceStatuses).toHaveLength(9);
  });

  it("mode оповещений классификатора — из union NotificationMode", () => {
    const modes = new Set(readClassifier().flatMap((entry) => entry.notifications.map((item) => item.mode)));
    modes.forEach((mode) => expect(["card112", "integration", "none", "mapped"]).toContain(mode));
  });
});

describe("ридеры мок-слоя: мемоизация и защита от мутации", () => {
  it("повторный вызов отдаёт тот же объект (JSON читается один раз)", () => {
    expect(readCards()).toBe(readCards());
    expect(readReference()).toBe(readReference());
  });

  it("данные заморожены: мутация бросает TypeError", () => {
    const [firstCard] = readCards();
    expect(Object.isFrozen(firstCard)).toBe(true);
    expect(() => {
      (firstCard as { summary: string }).summary = "изменено";
    }).toThrow(TypeError);
    expect(() => (readCards() as unknown as unknown[]).push({})).toThrow(TypeError);
  });
});
