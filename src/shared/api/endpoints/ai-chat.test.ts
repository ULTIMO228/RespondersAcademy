import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "../client";
import type { ChatRequest, ChatResponse } from "../types";
import { postAttemptChat } from "./ai-chat";

const REQUEST: ChatRequest = {
  attemptId: "att-02",
  mode: "dds",
  message: "Почему снижен балл за время?",
  history: [{ role: "user", content: "Здравствуйте" }],
};

const REPLY: ChatResponse = {
  reply: "Итог попытки: 95 баллов.",
  source: "template",
  provider: null,
  modelName: null,
};

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("клиент чата разбора попытки: POST /api/v1/ai/chat", () => {
  it("отправляет тело запроса JSON-ом и возвращает ответ как есть", async () => {
    const fetchMock = stubFetch(200, REPLY);
    await expect(postAttemptChat(REQUEST)).resolves.toEqual(REPLY);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/v1/ai/chat");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(REQUEST);
  });

  it("передаёт AbortSignal в запрос: отмена шторки обрывает ожидание ответа", async () => {
    const fetchMock = stubFetch(200, REPLY);
    const controller = new AbortController();
    await postAttemptChat(REQUEST, controller.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("чужая попытка (403) — ApiError с сообщением сервера, а не ServerRequiredError", async () => {
    stubFetch(403, {
      error: { code: "forbidden", message: "Обучающемуся доступны только собственные результаты" },
    });
    const error = await postAttemptChat({ ...REQUEST, attemptId: "att-01" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("неверное тело (400) — ApiError с кодом validationFailed", async () => {
    stubFetch(400, {
      error: { code: "validationFailed", message: "Сообщение должно быть от 1 до 1000 символов" },
    });
    const error = await postAttemptChat({ ...REQUEST, message: "   " }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 400, code: "validationFailed" });
  });
});
