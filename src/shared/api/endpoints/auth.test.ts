// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, createApiClient } from "../client";
import { resetMockStore } from "../mock/store";
import { handlePostLogin } from "../mock/routes";
import { LOGIN_FAILURE_MESSAGES, login, mapLoginError } from "./auth";

const BASE_URL = "http://localhost/api/mock";

/** Клиент поверх готового handler'а POST /api/mock/auth/login (T1.1-08) — без сети. */
const handlerClient = createApiClient({
  baseUrl: BASE_URL,
  fetcher: async (input, init) => handlePostLogin(new Request(String(input), init)),
});

async function captureError(action: Promise<unknown>): Promise<unknown> {
  try {
    await action;
  } catch (error) {
    return error;
  }
  throw new Error("ожидалась ошибка");
}

beforeEach(() => {
  resetMockStore();
});

describe("login() против handler'а /auth/login", () => {
  it("верные креды обучающегося → только { userId, role }: токен из тела клиент не сохраняет", async () => {
    const result = await login({ login: "ivanov", password: "student112", armNumber: 1 }, handlerClient);
    expect(result).toEqual({ userId: "u-005", role: "student" });
  });

  it("номер АРМ не обязателен для входа", async () => {
    const result = await login({ login: "ivanov", password: "student112" }, handlerClient);
    expect(result).toEqual({ userId: "u-005", role: "student" });
  });

  it("неподдерживаемый код 2FA отклоняется", async () => {
    const credentials = { login: "ivanov", password: "student112", armNumber: 1, twoFactorCode: "000000" };
    const error = await captureError(login(credentials, handlerClient));
    expect((error as ApiError).status).toBe(400);
  });

  it("неверный пароль → 401 и единое сообщение", async () => {
    const error = await captureError(
      login({ login: "ivanov", password: "wrong", armNumber: 1 }, handlerClient),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(mapLoginError(error)).toEqual({ reason: "invalid", message: "Неверный логин или пароль" });
  });

  it("номер АРМ сверяется с armNumber: чужой АРМ → 401", async () => {
    const error = await captureError(
      login({ login: "ivanov", password: "student112", armNumber: 2 }, handlerClient),
    );
    expect(mapLoginError(error).reason).toBe("invalid");
  });

  it("заблокированная учётка (egorov, isActive=false) → 403", async () => {
    const error = await captureError(
      login({ login: "egorov", password: "student112", armNumber: 6 }, handlerClient),
    );
    expect((error as ApiError).status).toBe(403);
    expect(mapLoginError(error)).toEqual({ reason: "blocked", message: LOGIN_FAILURE_MESSAGES.blocked });
  });
});

describe("mapLoginError", () => {
  it("400 → сообщение сервера (валидация)", () => {
    const error = new ApiError(400, "validationFailed", "Укажите номер АРМ");
    expect(mapLoginError(error)).toEqual({ reason: "validation", message: "Укажите номер АРМ" });
  });

  it("сеть (status 0) → network", () => {
    expect(mapLoginError(new ApiError(0, "networkError", "Нет соединения с сервером")).reason).toBe(
      "network",
    );
  });

  it("500 и не-ApiError → unknown", () => {
    expect(mapLoginError(new ApiError(500, "internal", "x")).reason).toBe("unknown");
    expect(mapLoginError(new Error("boom"))).toEqual({
      reason: "unknown",
      message: LOGIN_FAILURE_MESSAGES.unknown,
    });
  });
});
