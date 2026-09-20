// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getCardRoute } from "../../../../../app/api/mock/cards/[id]/route";
import { GET as getCardsRoute } from "../../../../../app/api/mock/cards/route";
import type { ApiErrorBody, ArmCardFixture, CardDetails, PageResponse } from "../../types";
import { readArmFixtures, readClassifier } from "../readers";
import { resetMockStore } from "../store";

const FIXTURE_COUNT = 12;
const TRAINING_COUNT = 96;

/** Запрос списка; базовые кейсы T1.1-10 — только по фикстурам (dataset=fixtures). */
function getCards(query = "", dataset = "fixtures"): Promise<Response> {
  const separator = query.startsWith("?") ? "&" : "?";
  return getCardsRoute(new Request(`http://localhost/api/mock/cards${query}${separator}dataset=${dataset}`));
}

async function listOf(query: string, dataset = "all"): Promise<PageResponse<ArmCardFixture>> {
  return (await getCards(query, dataset)).json();
}

function getCard(id: string): Promise<Response> {
  return getCardRoute(new Request(`http://localhost/api/mock/cards/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /api/mock/cards", () => {
  it("первая страница по умолчанию: perPage=10, total — все фикстуры", async () => {
    const body: PageResponse<ArmCardFixture> = await (await getCards()).json();
    expect(body).toMatchObject({ total: FIXTURE_COUNT, page: 1, perPage: 10 });
    expect(body.items).toHaveLength(10);
  });

  it("границы пагинации: вторая страница — остаток, за пределами — пустой items", async () => {
    const second: PageResponse<ArmCardFixture> = await (await getCards("?page=2&perPage=10")).json();
    expect(second.items).toHaveLength(FIXTURE_COUNT - 10);
    const beyond: PageResponse<ArmCardFixture> = await (await getCards("?page=5")).json();
    expect(beyond).toMatchObject({ items: [], total: FIXTURE_COUNT, page: 5 });
  });

  it("q (кириллица, регистронезависимо) сужает выдачу; без совпадений → total 0", async () => {
    const body: PageResponse<ArmCardFixture> = await (
      await getCards(`?q=${encodeURIComponent("чертановская")}`)
    ).json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBeLessThan(FIXTURE_COUNT);
    expect(body.items.every((card) => card.address.formal.toLowerCase().includes("чертановская"))).toBe(true);
    const none: PageResponse<ArmCardFixture> = await (await getCards("?q=zzzz")).json();
    expect(none).toMatchObject({ total: 0, items: [] });
  });

  it("q по номеру и фильтры status (повторные ключи) / type", async () => {
    expect(((await (await getCards("?q=881412")).json()) as PageResponse<ArmCardFixture>).total).toBe(1);
    const byStatus: PageResponse<ArmCardFixture> = await (
      await getCards("?status=completed&status=notNotified")
    ).json();
    expect(byStatus.items.map((card) => card.cardStatus).sort()).toEqual(["completed", "notNotified"]);
    const byType: PageResponse<ArmCardFixture> = await (
      await getCards(`?type=${encodeURIComponent("дтп с пострадавшими")}`)
    ).json();
    expect(byType.total).toBe(1);
  });

  it.each(["?page=abc", "?perPage=0", "?status=nope", "?cardStatus=nope", "?createdFrom=вчера"])(
    "мусорный параметр %s → 400",
    async (query) => {
      const response = await getCards(query);
      expect(response.status).toBe(400);
      expect(((await response.json()) as ApiErrorBody).error.code).toBe("badRequest");
    },
  );

  it("мусорный dataset → 400", async () => {
    expect((await getCards("", "nope")).status).toBe(400);
  });
});

describe("GET /api/mock/cards — расширенный поиск (T1.2-04)", () => {
  it("по умолчанию: фикстуры + 96 учебных карточек в списочной проекции", async () => {
    const all = await listOf("?perPage=100&page=2");
    expect(all.total).toBe(FIXTURE_COUNT + TRAINING_COUNT);
    const training = await listOf("?perPage=100", "training");
    expect(training.total).toBe(TRAINING_COUNT);
    const first = training.items[0];
    expect(first).toMatchObject({ id: "c-001", number: 1, cardStatus: "registered" });
    expect(first.applicant.name).toBe("Сидоров Иван Сергеевич");
    expect(first.what.classifierCode).toBeDefined();
  });

  it("?okrug=ЮАО&cardStatus=registered → только ЮАО со статусом «Зарегистрирована»", async () => {
    const body = await listOf(`?okrug=${encodeURIComponent("ЮАО")}&cardStatus=registered`);
    expect(body.total).toBe(6);
    expect(body.items.every((card) => card.address.okrug === "ЮАО" && card.cardStatus === "registered")).toBe(
      true,
    );
  });

  it.each([
    ["incidentType", "пожар: квартира", ["card-36814845"]],
    ["descriptiveAddress", "дерево во дворе", ["card-881412"]],
    ["description", "направлена бригада", ["card-881412"]],
    ["applicant", "749 512", ["card-881412"]],
    ["cardNumber", "881412", ["card-881412"]],
    ["operator", "Рожкова", ["card-881412"]],
  ])("скалярное поле %s=%s", async (key, value, expected) => {
    const body = await listOf(`?${key}=${encodeURIComponent(value)}`, "fixtures");
    expect(body.items.map((card) => card.id)).toEqual(expected);
  });

  it("адрес (подстрока) и район (точное совпадение одного значения)", async () => {
    const byAddress = await listOf(`?address=${encodeURIComponent("чертановская")}`, "fixtures");
    expect(byAddress.items.map((card) => card.id)).toContain("card-881412");
    expect(byAddress.items.every((card) => card.address.formal.includes("Чертановская"))).toBe(true);
    const byRaion = await listOf(`?raion=${encodeURIComponent("чертаново южное")}`, "fixtures");
    expect(byRaion.total).toBeGreaterThan(0);
    expect(byRaion.items.every((card) => card.address.raion === "Чертаново Южное")).toBe(true);
  });

  it("множественные поля — повторные ключи (OR) и синоним-имя поля", async () => {
    const byOkrugs = await listOf(`?okrug=${encodeURIComponent("ТАО")}&okrugs=${encodeURIComponent("ЦАО")}`);
    expect(byOkrugs.items.map((card) => card.address.okrug).sort()).toEqual(["ТАО", "ЦАО", "ЦАО", "ЦАО"]);
    const byArm = await listOf("?arm=7&arm=12", "fixtures");
    expect(byArm.items.map((card) => card.id)).toEqual(["card-881412", "card-36814851"]);
    const bySource = await listOf(`?source=${encodeURIComponent("СОДЧ (МВД)")}`, "fixtures");
    expect(bySource.items.map((card) => card.source)).toEqual(["СОДЧ (МВД)"]);
    const byService = await listOf("?service=svc-upr-chert", "fixtures");
    expect(byService.items.map((card) => card.id)).toContain("card-881412");
    const bySign = await listOf(`?sign=${encodeURIComponent("Дерево")}`, "fixtures");
    expect(bySign.items.map((card) => card.id)).toEqual(["card-881412"]);
    const byChannel = await listOf(`?channel=${encodeURIComponent("телефония (АОН)")}`, "fixtures");
    const withAon = readArmFixtures().filter((card) => card.phones.aon.trim() !== "");
    expect(byChannel.total).toBe(withAon.length);
  });

  it("регион и период createdFrom/createdTo (включительно)", async () => {
    const byRegion = await listOf(`?region=${encodeURIComponent("москва")}`, "fixtures");
    expect(byRegion.total).toBeGreaterThan(0);
    const period = "?createdFrom=2026-09-17T11:12:43%2B03:00&createdTo=2026-09-17T11:16:53%2B03:00";
    expect((await listOf(period, "fixtures")).items.map((card) => card.id)).toEqual([
      "card-36814845",
      "card-36814850",
    ]);
  });

  it("учебные карточки ищутся по своим данным: заявитель и адрес", async () => {
    const body = await listOf(`?applicant=${encodeURIComponent("Сидоров Иван")}`, "training");
    expect(body.items.map((card) => card.id)).toContain("c-001");
    const byAddress = await listOf(`?address=${encodeURIComponent("Цюрупы")}`);
    expect(byAddress.items.map((card) => card.id)).toContain("c-013");
  });

  it("пагинация применяется после фильтров: total — после фильтров", async () => {
    const body = await listOf(`?okrug=${encodeURIComponent("ЮАО")}&perPage=2&page=2`);
    const southern = readArmFixtures().filter((card) => card.address.okrug === "ЮАО");
    expect(body).toMatchObject({ total: southern.length, page: 2, perPage: 2 });
    expect(body.items).toHaveLength(2);
  });

  it("базовые status/type/q (T1.1-10) сочетаются с расширенными полями", async () => {
    const body = await listOf(
      `?status=registered&okrug=${encodeURIComponent("ЦАО")}&q=${encodeURIComponent("ДТП")}`,
    );
    expect(body.items.map((card) => card.id)).toEqual(["card-36814857"]);
  });
});

describe("GET /api/mock/cards/[id]", () => {
  it("card-* → фикстура", async () => {
    const body: CardDetails = await (await getCard("card-881412")).json();
    expect(body.kind).toBe("fixture");
    expect(body.card).toMatchObject({ number: 881412 });
    expect(body.runtime).toEqual({ statusEvents: [], workLines: [], reminders: [], sms: [] });
  });

  it("c-NNN → учебная карточка билета 1.1 с resolvedFixtureId (T1.2-09)", async () => {
    const body: CardDetails = await (await getCard("c-001")).json();
    expect(body.kind).toBe("training");
    if (body.kind !== "training") return;
    expect(body.card).toMatchObject({ id: "c-001", ticketNo: 1, situationNo: 1 });
    const fixture = readArmFixtures().find((candidate) => candidate.id === body.resolvedFixtureId);
    expect(fixture).toBeDefined();
    const code = fixture?.what.classifierCode;
    expect(readClassifier().some((entry) => entry.code === code)).toBe(true);
  });

  it.each(["nope", "c-1", "card-000", "c-999"])("неизвестный id %s → 404 в едином формате", async (id) => {
    const response = await getCard(id);
    expect(response.status).toBe(404);
    expect(((await response.json()) as ApiErrorBody).error).toMatchObject({ code: "notFound" });
  });
});
