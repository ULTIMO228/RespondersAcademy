import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  SERVER_REQUIRED_MESSAGE,
  ServerRequiredError,
  buildQuery,
  createApiClient,
} from "./client";
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

  it("успешный ответ входа: клиент оставляет только userId и role (токен не сохраняется)", async () => {
    const body = { userId: "u-005", role: "student", token: "t", twoFactorUsed: true, issuedAt: "x" };
    stubFetch(200, body);
    await expect(login({ login: "ivanov", password: "p", armNumber: 5 })).resolves.toEqual({
      userId: "u-005",
      role: "student",
    });
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

describe("requiresServer: раздел только для бэкенда (спека 002, R10)", () => {
  const serverClient = () => createApiClient({ baseUrl: "/api/v1", requiresServer: true });

  it("404 без { error } (Next без BACKEND_URL) → ServerRequiredError с русским сообщением", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("<html>404</html>", { status: 404 })),
    );
    const error = await serverClient()
      .get("/assignments")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServerRequiredError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "serverRequired", message: SERVER_REQUIRED_MESSAGE });
  });

  it("404 бэкенда по данным ({ error: { code } }) остаётся обычным ApiError", async () => {
    stubFetch(404, { error: { code: "notFound", message: "Задание «asg-9» не найдено" } });
    const error = await serverClient()
      .get("/assignments/asg-9")
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 404, code: "notFound", message: "Задание «asg-9» не найдено" });
  });

  it("не-404 без тела (500 прокси при недоступном бэкенде) — обычная ошибка сервера", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("", { status: 500 })),
    );
    const error = await serverClient()
      .get("/assignments")
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 500, code: "internal" });
  });

  it("сетевой сбой — networkError (баннер «Нет соединения»), а не «нужен сервер»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await serverClient()
      .get("/assignments")
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 0, code: "networkError" });
  });

  it("клиент без requiresServer (мок-слой, ИИ-панели) пустой 404 не переопределяет", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("", { status: 404 })),
    );
    const error = await createApiClient({ baseUrl: "/api/v1/ai" })
      .get("/scenarios/x/versions")
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 404, code: "notFound" });
  });
});
