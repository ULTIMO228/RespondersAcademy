// @vitest-environment node
/* Клиент серверной сессии: вход → профиль → смена пароля → выход поверх handler'ов мок-слоя с cookie-jar (как браузер). */
import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, createApiClient } from "../client";
import {
  handleGetAuthSession,
  handlePostLogin,
  handlePostLogout,
  handlePostLogoutAll,
  handlePostPassword,
} from "../mock/routes";
import { resetMockStore } from "../mock/store";
import { changePassword, getSession, login, logout, logoutAll } from "./auth";

const BASE_URL = "http://localhost/api/mock";
type Handler = (request: Request) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "POST /auth/login": handlePostLogin,
  "GET /auth/session": handleGetAuthSession,
  "POST /auth/logout": handlePostLogout,
  "POST /auth/logout-all": handlePostLogoutAll,
  "POST /auth/password": handlePostPassword,
};

/** Браузер без JS-доступа к cookie: jar хранит только то, что поставил сервер (Set-Cookie). */
function createBrowser() {
  let cookie = "";
  const client = createApiClient({
    baseUrl: BASE_URL,
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      if (cookie) headers.set("cookie", cookie);
      const handler = HANDLERS[`${init?.method ?? "GET"} ${url.pathname.replace("/api/mock", "")}`];
      const response = await handler(new Request(url, { ...init, headers }));
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = /Max-Age=0/.test(setCookie) ? "" : setCookie.split(";")[0];
      return response;
    },
  });
  return { client, hasCookie: () => cookie !== "" };
}

beforeEach(() => {
  resetMockStore();
});

describe("клиент сессии", () => {
  it("вход ставит cookie на стороне сервера; getSession возвращает профиль без пароля", async () => {
    const browser = createBrowser();
    await login({ login: "ivanov", password: "student112" }, browser.client);
    expect(browser.hasCookie()).toBe(true);
    const profile = await getSession(browser.client);
    expect(profile).toMatchObject({ id: "u-005", role: "student" });
    expect("password" in profile).toBe(false);
  });

  it("без входа getSession → 401", async () => {
    const error = await getSession(createBrowser().client).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("logout: 204 без тела не ломает клиент; сессия после него недействительна", async () => {
    const browser = createBrowser();
    await login({ login: "ivanov", password: "student112" }, browser.client);
    await expect(logout(browser.client)).resolves.toBeUndefined();
    expect(browser.hasCookie()).toBe(false);
    await expect(getSession(browser.client)).rejects.toMatchObject({ status: 401 });
  });

  it("logoutAll завершает и вторую сессию того же пользователя", async () => {
    const first = createBrowser();
    const second = createBrowser();
    await login({ login: "ivanov", password: "student112" }, first.client);
    await login({ login: "ivanov", password: "student112" }, second.client);
    await expect(logoutAll(first.client)).resolves.toBeUndefined();
    await expect(getSession(second.client)).rejects.toMatchObject({ status: 401 });
  });

  it("changePassword: неверный текущий → 400 (сессия жива), новый проходит политику → 204", async () => {
    const browser = createBrowser();
    await login({ login: "ivanov", password: "student112" }, browser.client);
    await expect(
      changePassword({ currentPassword: "nope", newPassword: "Novyj-parol-77" }, browser.client),
    ).rejects.toMatchObject({ status: 400, message: "Текущий пароль указан неверно" });
    await expect(
      changePassword({ currentPassword: "student112", newPassword: "short" }, browser.client),
    ).rejects.toMatchObject({ status: 400 });
    await expect(getSession(browser.client)).resolves.toMatchObject({ id: "u-005" });
    await expect(
      changePassword({ currentPassword: "student112", newPassword: "Novyj-parol-77" }, browser.client),
    ).resolves.toBeUndefined();
    await expect(getSession(browser.client)).resolves.toMatchObject({ id: "u-005" });
  });
});
