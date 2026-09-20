import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, buildQuery, createApiClient } from "./client";
import { getCard, getCards, getReports, listScenarios, login, postCardStatus } from "./endpoints";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(status: number, payload: unknown): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: FetchMock): URL {
  return new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildQuery", () => {
  it("кодирует кириллицу", () => {
    expect(buildQuery({ q: "Чертановская" })).toBe(`?q=${encodeURIComponent("Чертановская")}`);
  });

  it("массив → повторные ключи; undefined/null/пустое опускается", () => {
    expect(buildQuery({ okrug: ["ЮАО", "САО"], raion: undefined, type: null, q: "" })).toBe(
      `?okrug=${encodeURIComponent("ЮАО")}&okrug=${encodeURIComponent("САО")}`,
    );
  });

  it("без параметров — пустая строка", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({})).toBe("");
  });
});

describe("доменные функции: URL, метод, тело", () => {
  it("getCards({ okrug: 'ЮАО' }) собирает корректный query на /api/mock/cards", async () => {
    const fetchMock = stubFetch(200, { items: [], total: 0, page: 1, perPage: 10 });
    await getCards({ okrug: "ЮАО", perPage: 10, page: 2 });
    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/api/mock/cards");
    expect(url.searchParams.get("okrug")).toBe("ЮАО");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("множественные фильтры сценариев — повторными ключами", async () => {
    const fetchMock = stubFetch(200, []);
    await listScenarios({ group: ["пожар на улице", "ДТП"], difficulty: [1, 2] });
    const url = requestedUrl(fetchMock);
    expect(url.searchParams.getAll("group")).toEqual(["пожар на улице", "ДТП"]);
    expect(url.searchParams.getAll("difficulty")).toEqual(["1", "2"]);
  });

  it("POST отправляет JSON-тело, id кодируется в пути", async () => {
    const fetchMock = stubFetch(200, { id: "st-001" });
    await postCardStatus("card-881412", { ddsStatus: "notAccepted", comment: "Вне компетенции" });
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(fetchMock).pathname).toBe("/api/mock/cards/card-881412/status");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ ddsStatus: "notAccepted", comment: "Вне компетенции" });
  });

  it("getReports передаёт sessionId, getCard — GET без тела", async () => {
    const fetchMock = stubFetch(200, {});
    await getReports("ses-2026-09-16-01");
    await getCard("c-001");
    expect(requestedUrl(fetchMock).searchParams.get("sessionId")).toBe("ses-2026-09-16-01");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1][1]?.body).toBeUndefined();
  });

  it("успешный ответ возвращается как есть", async () => {
    const session = { userId: "u-005", role: "student", token: "t", twoFactorUsed: true, issuedAt: "x" };
    stubFetch(200, session);
    await expect(login({ login: "ivanov", password: "p", armNumber: 5 })).resolves.toEqual(session);
  });
});

describe("ApiError: маппинг статусов и единого формата ошибки", () => {
  it.each([
    [400, "validationFailed", "Укажите комментарий"],
    [401, "unauthorized", "Неверный логин или пароль"],
    [403, "accountBlocked", "Учётная запись заблокирована. Обратитесь к администратору"],
    [404, "notFound", "Карточка не найдена"],
    [409, "invalidTransition", "Переход недопустим"],
    [500, "internal", "Внутренняя ошибка мок-сервера"],
  ])("%i { error } → ApiError с исходным status, code и ru-сообщением", async (status, code, message) => {
    stubFetch(status, { error: { code, message } });
    const failure = await getCard("card-1").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status, code, message });
  });

  it("ответ без единого формата → ru-сообщение по статусу", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 404 })),
    );
    await expect(getCard("card-1")).rejects.toMatchObject({
      status: 404,
      code: "notFound",
      message: "Данные не найдены",
    });
  });

  it("сеть недоступна → status 0, networkError", async () => {
    const client = createApiClient({
      baseUrl: "/api/mock",
      fetcher: vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    await expect(client.get("/reference")).rejects.toMatchObject({ status: 0, code: "networkError" });
  });
});
