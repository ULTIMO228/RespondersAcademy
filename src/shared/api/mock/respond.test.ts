// @vitest-environment node
import { describe, expect, it } from "vitest";

import { StatusTransitionError } from "@/shared/lib";

import type { ApiErrorBody } from "../types";
import {
  badRequest,
  conflict,
  forbidden,
  HTTP_STATUS,
  jsonCreated,
  jsonError,
  jsonOk,
  MockApiError,
  notFound,
  toErrorResponse,
  unauthorized,
  validationFailed,
  withErrorHandling,
} from "./respond";

describe("jsonOk / jsonCreated", () => {
  it("отдаёт данные без обёртки со статусом 200", async () => {
    const response = jsonOk({ items: [1, 2] });
    expect(response.status).toBe(HTTP_STATUS.ok);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ items: [1, 2] });
  });

  it("jsonCreated → 201", () => {
    expect(jsonCreated({ id: "wl-001" }).status).toBe(HTTP_STATUS.created);
  });
});

describe("jsonError: единый формат ошибки", () => {
  it("{ error: { code, message } } и заданный статус", async () => {
    const response = jsonError(HTTP_STATUS.notFound, "notFound", "Карточка не найдена");
    expect(response.status).toBe(404);
    const body: ApiErrorBody = await response.json();
    expect(body).toEqual({ error: { code: "notFound", message: "Карточка не найдена" } });
  });
});

describe("фабрики ошибок и toErrorResponse", () => {
  it.each([
    [badRequest, 400, "badRequest"],
    [validationFailed, 400, "validationFailed"],
    [unauthorized, 401, "unauthorized"],
    [forbidden, 403, "forbidden"],
    [notFound, 404, "notFound"],
    [conflict, 409, "conflict"],
  ] as const)("%o → %i %s", async (factory, status, code) => {
    const response = toErrorResponse(factory("Сообщение"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: "Сообщение" } });
  });

  it("неизвестное исключение → 500 internal с ru-сообщением без деталей", async () => {
    const response = toErrorResponse(new Error("stack secret"));
    expect(response.status).toBe(500);
    const body: ApiErrorBody = await response.json();
    expect(body.error.code).toBe("internal");
    expect(body.error.message).not.toContain("secret");
    expect(body.error.message).toMatch(/[А-Яа-я]/);
  });
});

describe("withErrorHandling", () => {
  it("пропускает успешный ответ", async () => {
    const handler = withErrorHandling(() => jsonOk({ ok: true }));
    expect((await handler()).status).toBe(200);
  });

  it("MockApiError из async-handler → ответ-ошибка", async () => {
    const handler = withErrorHandling(async (id: string) => {
      throw new MockApiError(HTTP_STATUS.conflict, "invalidTransition", `Переход для ${id} недопустим`);
    });
    const response = await handler("ses-1");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "invalidTransition", message: "Переход для ses-1 недопустим" },
    });
  });
});

describe("toErrorResponse — ошибки машины статусов (T1.2-01)", () => {
  it.each([
    ["invalidTransition", HTTP_STATUS.conflict, "invalidTransition"],
    ["commentRequired", HTTP_STATUS.badRequest, "validationFailed"],
    ["unknownStatus", HTTP_STATUS.badRequest, "validationFailed"],
  ] as const)("%s → %i %s с сообщением машины", async (machineCode, status, apiCode) => {
    const response = toErrorResponse(
      new StatusTransitionError(machineCode, "Сообщение", "accepted", "workDone"),
    );
    expect(response.status).toBe(status);
    expect(((await response.json()) as ApiErrorBody).error).toEqual({ code: apiCode, message: "Сообщение" });
  });
});
