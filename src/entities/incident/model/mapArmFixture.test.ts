import { describe, expect, it } from "vitest";

import armCardsJson from "@mocks/fixtures/arm-cards.json";
import cardsJson from "@mocks/cards.json";
import type { ArmCardFixtureContract, IncidentCard } from "@/shared/api";
import type { StatusTone } from "@/shared/ui";

import { toIncidentLinks } from "./links";
import { EMPTY_CELL, mapArmFixture } from "./mapArmFixture";
import type { IncidentMapContext } from "./mapArmFixture";
import { mapTrainingCard } from "./mapTrainingCard";
import type { IncidentListItem } from "./types";

const FIXTURES = armCardsJson.cards as unknown as ArmCardFixtureContract[];
const TRAINING = cardsJson.cards as unknown as IncidentCard[];

const CONTEXT: IncidentMapContext = {
  serviceNames: { "svc-101": "Служба 101", "svc-dds-chert": "ДДС Чертаново Южное" },
  serviceStatusTitles: { added: "Добавлена", received: "Получена службой", accepted: "Принята" },
  cardStatusTitles: { registered: "Зарегистрирована", completed: "Завершена" },
  getStatusTone: (): StatusTone => "new",
  myServiceId: "svc-dds-chert",
};

/** 11 колонок ленты: Связи · ЧС · Опер. · АРМ · Номер · Дата · Время · Тип · Постр. · Адрес · Статус службы. */
function columnValues(item: IncidentListItem): unknown[] {
  return [
    item.links,
    item.emergencyMark,
    item.operatorNumber,
    item.armNumber,
    item.number,
    item.createdAt,
    item.createdAt,
    item.typeName,
    item.victims,
    item.address,
    item.serviceStatus.title,
  ];
}

function fixture(id: string): ArmCardFixtureContract {
  const found = FIXTURES.find((card) => card.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe("mapArmFixture — списочная проекция GET /api/mock/cards", () => {
  it.each(["card-881412", "card-36814850", "card-36814856", "card-36814859"])(
    "%s: все 11 колонок заполнены (без undefined и пустых строк)",
    (id) => {
      const values = columnValues(mapArmFixture(fixture(id), CONTEXT));
      expect(values).toHaveLength(11);
      values.forEach((value) => {
        expect(value).not.toBeUndefined();
        expect(value).not.toBe("");
      });
    },
  );

  it("ВИС (СОДЧ МВД): оператор «0», АРМ — прочерк, тип и адрес из фикстуры", () => {
    const item = mapArmFixture(fixture("card-36814856"), CONTEXT);
    expect(item).toMatchObject({ operatorNumber: "0", armNumber: EMPTY_CELL, typeName: "Пожар" });
    expect(item.address.startsWith("Россия")).toBe(false);
  });

  it("ЧП/ЧС — красный бейдж, СМС — счётчик, статус моей службы — в «Статус службы»", () => {
    expect(mapArmFixture(fixture("card-36814850"), CONTEXT).emergencyMark).toBe("ЧП");
    expect(mapArmFixture(fixture("card-36814859"), CONTEXT).smsCount).toBeGreaterThan(0);
    const worked = mapArmFixture(fixture("card-881412"), CONTEXT);
    expect(worked.href).toBe("/arm/card/card-881412");
    expect(worked.issuedAt).toBeNull();
    expect(worked.description?.meta).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}/);
  });
});

describe("mapTrainingCard и связи", () => {
  it("учебная карточка занятия: номер — цифры id, переход в /arm/card/c-NNN, таймер от issuedAt", () => {
    const card = TRAINING.find((candidate) => candidate.id === "c-047") as IncidentCard;
    const item = mapTrainingCard({ card, issuedAt: "2026-09-17T11:20:00+03:00", armNumber: "1" }, CONTEXT);
    expect(item).toMatchObject({ number: 47, href: "/arm/card/c-047", state: "new" });
    expect(item.issuedAt).toBe("2026-09-17T11:20:00+03:00");
    columnValues(item).forEach((value) => expect(value).not.toBeUndefined());
  });

  it("карточка со связями (c-047 → c-003): роли «главная»/«подчинённая», своя — текущая", () => {
    const links = toIncidentLinks(
      [
        { cardId: "c-003", role: "main" },
        { cardId: "c-047", role: "subordinate" },
      ],
      "c-047",
    );
    expect(links.map((link) => [link.number, link.role, link.isCurrent])).toEqual([
      [3, "главная", false],
      [47, "подчинённая", true],
    ]);
    expect(links[0].href).toBe("/arm/card/c-003");
  });
});
