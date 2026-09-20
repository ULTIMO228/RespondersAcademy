import { describe, expect, it } from "vitest";

import { armCardFixtures, cards, reference, scenarios } from "@/shared/api";
import type { ArmCardFixtureContract, IncidentCard, SessionContract } from "@/shared/api";
import { createMemoryStorage } from "@/shared/lib";

import { getServiceNames, mergeTrainingCard, pickMyServiceId } from "./cardView";
import { getHintText } from "./hints";
import { resolveLinkChain, toLinkedCard } from "./links";
import { findNextCardId } from "./nextCard";
import { enqueue, outboxStorageKey, readOutbox, writeOutbox } from "./outbox";
import type { OutboxItem } from "./outbox";
import { buildTraineeHistory } from "./serviceHistory";
import { toMoscowIso } from "./time";

const fixture = (id: string) =>
  armCardFixtures.find((card) => card.id === id) as unknown as ArmCardFixtureContract;
const training = (id: string) => (cards as IncidentCard[]).find((card) => card.id === id)!;

describe("резолвер учебная карточка ↔ фикстура (T2.3-01)", () => {
  it("учебные поля поверх фикстуры группы ЕКП", () => {
    const merged = mergeTrainingCard(training("c-063"), fixture("card-881412"));
    expect(merged).toMatchObject({
      id: "c-063",
      number: 63,
      applicant: { name: "Иванова Елена Сергеевна", status: "очевидец" },
      phones: { aon: "916 896 3254" },
      description: "Ребёнок 4 года один в автомобиле, двери заблокировались",
      workLines: [],
    });
    expect(merged.what.classifierCode).toBe("14080106");
    expect(merged.what.casualties.injured).toBe(true);
    expect(merged.notificationList.length).toBeGreaterThan(0);
  });

  it("ВИС-фикстура сохраняет признак createdByVis и пустой классификатор", () => {
    const merged = mergeTrainingCard(training("c-001"), fixture("card-36814856"));
    expect(merged.createdByVis).toBe(true);
    expect(merged.what.classifierCode).toBe("");
  });

  it("моя служба — первая служба АРМ-112, иначе первая не телефонная; имена служб", () => {
    expect(pickMyServiceId(fixture("card-881412").notificationList, reference.services)).toBe(
      "svc-upr-chert",
    );
    expect(pickMyServiceId(fixture("card-36814855").notificationList, reference.services)).toBe("svc-103");
    expect(getServiceNames(fixture("card-36814855").notificationList, reference.services)).toEqual([
      "Служба 103",
    ]);
  });
});

describe("история моей службы (T2.3-01, T2.3-12)", () => {
  it("«Добавлена» из фикстуры → «Получена службой» при открытии → статусы попытки", () => {
    const card = fixture("card-881412");
    const history = buildTraineeHistory({
      notificationList: card.notificationList,
      myServiceId: "svc-upr-chert",
      openedAt: "2026-09-20T10:00:00+03:00",
      marks: [{ ddsStatus: "accepted", at: "2026-09-20T10:00:20+03:00", dutyNumber: "7" }],
    });
    expect(history["svc-upr-chert"].map((event) => event.status)).toEqual(["added", "received", "accepted"]);
    expect(history["svc-upr-chert"][1]).toMatchObject({ at: "2026-09-20T10:00:00+03:00", actor: "оп. 0" });
    expect(history["svc-upr-chert"][2].dutyNumber).toBe("7");
    expect(history["svc-pref-uao"]).toHaveLength(1);
  });
});

describe("связи, следующая карточка, подсказки", () => {
  it("цепочка мок-слоя или статичная цепочка фикстур; роли по-русски", () => {
    expect(resolveLinkChain("card-36814859", []).map((link) => link.role)).toEqual([
      "main",
      "subordinate",
      "subordinate",
    ]);
    expect(resolveLinkChain("card-881412", [])).toEqual([]);
    const main = resolveLinkChain("card-36814859", [])[0];
    expect(
      toLinkedCard(main, {
        kind: "fixture",
        card: fixture("card-36814845"),
        runtime: { statusEvents: [], workLines: [], reminders: [], sms: [] },
      }),
    ).toEqual({
      id: "card-36814845",
      number: 36814845,
      role: "главная",
      finalType: "пожар: квартира",
    });
  });

  it("следующая карточка — по ленте занятия, иначе по очереди сценария", () => {
    const session = {
      cardFlow: [
        { cardId: "c-095", studentId: "u-005", issuedAt: "2026-09-17T11:20:00+03:00", level: 2 },
        { cardId: "c-093", studentId: "u-005", issuedAt: "2026-09-17T11:24:00+03:00", level: 2 },
      ],
    } as SessionContract;
    expect(findNextCardId("c-095", "u-005", [session], null)).toBe("c-093");
    expect(findNextCardId("c-093", "u-005", [session], null)).toBeNull();
    const scenario = scenarios.find((item) => item.id === "s-032")!;
    expect(findNextCardId("c-094", "u-005", [], scenario)).toBe("c-095");
  });

  it("подсказка: только при hints.enabled, шаг по факту действий", () => {
    const hints = { enabled: true, texts: ["Откройте карточку", "Проставьте «Принята»", "Позвоните в 102"] };
    expect(getHintText({ ...hints, enabled: false }, { statuses: 0, calls: 0 })).toBeNull();
    expect(getHintText(hints, { statuses: 0, calls: 0 })?.text).toBe("Откройте карточку");
    expect(getHintText(hints, { statuses: 1, calls: 0 })?.text).toBe("Проставьте «Принята»");
    expect(getHintText(hints, { statuses: 5, calls: 1 })?.step).toBe(2);
  });
});

describe("буфер досылки (T2.3-20)", () => {
  it("хранится по курсанту и карточке, правки текста схлопываются, мусор отбрасывается", () => {
    const storage = createMemoryStorage();
    const key = outboxStorageKey("c-094", "u-005");
    const text = (value: string): OutboxItem => ({
      id: value,
      kind: "progress",
      attemptId: "att-9",
      request: { enteredText: { dispatcherAction: value } },
    });
    let items = enqueue([], text("Сооб"));
    items = enqueue(items, text("Сообщение принято"));
    expect(items).toHaveLength(1);
    items = enqueue(items, {
      id: "s",
      kind: "status",
      cardId: "c-094",
      attemptId: "att-9",
      request: { ddsStatus: "accepted" },
      at: "2026-09-20T10:00:00+03:00",
    });
    writeOutbox(storage, key, items);
    expect(readOutbox(storage, key)).toEqual(items);
    storage.set(key, "мусор");
    expect(readOutbox(storage, key)).toEqual([]);
    writeOutbox(storage, key, []);
    expect(storage.get(key)).toBeNull();
  });

  it("метки времени — ISO +03:00", () => {
    expect(toMoscowIso(Date.parse("2026-09-20T07:00:00Z"))).toBe("2026-09-20T10:00:00+03:00");
  });
});
