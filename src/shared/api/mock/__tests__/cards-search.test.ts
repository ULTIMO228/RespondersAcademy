// @vitest-environment node
/*
 * GET /api/mock/cards — фильтры расширенного поиска главного экрана АРМ на полном датасете (T2.2-01, T2.2-13):
 * 8 обязательных фильтров критерия приёмки spec/000-фронт/04-pages/01-arm-main.md, их AND-комбинация, вид ленты
 * «выберите что показать» (view) и пагинация после фильтров. Вызывается корневой route handler (с filterCards).
 */
import { beforeEach, describe, expect, it } from "vitest";

import * as cardsRoute from "../../../../../app/api/mock/cards/route";
import type { ArmCardFixture, PageResponse } from "../../types";
import { resetMockStore } from "../store";

const MAX_PER_PAGE = 100;

async function requestCards(query: string): Promise<{ status: number; body: PageResponse<ArmCardFixture> }> {
  const response = await cardsRoute.GET(new Request(`http://localhost/api/mock/cards?${query}`));
  return { status: response.status, body: (await response.json()) as PageResponse<ArmCardFixture> };
}

async function totalOf(query: string): Promise<number> {
  const { status, body } = await requestCards(query);
  expect(status).toBe(200);
  return body.total;
}

async function itemsOf(query: string): Promise<ArmCardFixture[]> {
  return (await requestCards(`${query}&perPage=${MAX_PER_PAGE}`)).body.items;
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /api/mock/cards — 8 обязательных фильтров на датасете all", () => {
  it("каждый фильтр сужает выдачу и все найденные карточки ему соответствуют", async () => {
    const full = await totalOf("dataset=all");
    const cases: Array<[string, (card: ArmCardFixture) => boolean]> = [
      [
        `incidentType=${encodeURIComponent("пожар")}`,
        (card) => /пожар/i.test(card.what.finalType + card.what.klass),
      ],
      [`address=${encodeURIComponent("Вавилова")}`, (card) => card.address.formal.includes("Вавилова")],
      [`okrug=${encodeURIComponent("ЦАО")}`, (card) => card.address.okrug === "ЦАО"],
      ["cardStatus=notNotified", (card) => card.cardStatus === "notNotified"],
      [
        `createdFrom=${encodeURIComponent("2026-09-17T11:40:00+03:00")}`,
        (card) => Date.parse(card.createdAt) >= Date.parse("2026-09-17T11:40:00+03:00"),
      ],
      [`description=${encodeURIComponent("дым")}`, (card) => /дым/i.test(card.description)],
      [`applicant=${encodeURIComponent("Иванов")}`, (card) => card.applicant.name.includes("Иванов")],
      ["cardNumber=881412", (card) => String(card.number).includes("881412")],
    ];
    for (const [query, matches] of cases) {
      const items = await itemsOf(`dataset=all&${query}`);
      expect(items.length, query).toBeGreaterThan(0);
      expect(items.length, query).toBeLessThan(full);
      expect(items.every(matches), query).toBe(true);
    }
  });

  it("заявитель по цифрам АОН; комбинация фильтров — AND (сужает сильнее каждого)", async () => {
    const byPhone = await itemsOf("dataset=all&applicant=8916");
    expect(byPhone.every((card) => card.phones.aon.replace(/\D/g, "").includes("8916"))).toBe(true);
    const okrug = await totalOf(`dataset=all&okrug=${encodeURIComponent("ЮАО")}`);
    const status = await totalOf("dataset=all&cardStatus=registered");
    const both = await totalOf(`dataset=all&okrug=${encodeURIComponent("ЮАО")}&cardStatus=registered`);
    expect(both).toBeLessThan(okrug);
    expect(both).toBeLessThanOrEqual(status);
    expect(both).toBeGreaterThan(0);
  });

  it("пустая выдача — 200 и total 0 (состояние «Карточек нет»), не ошибка", async () => {
    const { status, body } = await requestCards("cardNumber=000000000");
    expect(status).toBe(200);
    expect(body).toMatchObject({ items: [], total: 0 });
  });
});

describe("GET /api/mock/cards — статус и пагинация (T2.2-01)", () => {
  it("status=registered&page=2 — отфильтрованный срез второй страницы", async () => {
    const registered = await itemsOf("dataset=all&status=registered");
    expect(registered.every((card) => card.cardStatus === "registered")).toBe(true);
    const { body } = await requestCards("dataset=all&status=registered&page=2&perPage=10");
    expect(body).toMatchObject({
      page: 2,
      perPage: 10,
      total: await totalOf("dataset=all&status=registered"),
    });
    expect(body.items.map((card) => card.id)).toEqual(registered.slice(10, 20).map((card) => card.id));
  });
});

describe("GET /api/mock/cards — сортировка «Дата ↓» (T2.2-04)", () => {
  it("sort=-createdAt — новые сверху, до пагинации; мусор → 400", async () => {
    const items = await itemsOf("dataset=fixtures&sort=-createdAt");
    const times = items.map((card) => Date.parse(card.createdAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    const { body } = await requestCards("dataset=fixtures&sort=-createdAt&perPage=1");
    expect(body.items[0].id).toBe(items[0].id);
    expect((await requestCards("sort=number")).status).toBe(400);
  });
});

describe("GET /api/mock/cards — вид ленты view (T2.2-03)", () => {
  it("sms — только карточки с входящими СМС; empty — завершённые без обработки; мусор → 400", async () => {
    const sms = await itemsOf("dataset=fixtures&view=sms");
    expect(sms.map((card) => card.id)).toEqual(["card-36814859"]);
    const empty = await itemsOf("dataset=all&view=empty");
    expect(
      empty.every(
        (card) => card.workLines.length === 0 && ["completed", "unfinished"].includes(card.cardStatus),
      ),
    ).toBe(true);
    expect((await requestCards("view=nope")).status).toBe(400);
  });
});
