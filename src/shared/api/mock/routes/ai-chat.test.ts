// @vitest-environment node
/* Автономный чат разбора попытки POST /api/v1/ai/chat (спека 010, T018): права, проверка тела, шаблонный ответ. */
import { beforeEach, describe, expect, it } from "vitest";

import { POST as chatRoute } from "../../../../../app/api/v1/ai/chat/route";
import type { ApiErrorBody, ChatResponse } from "../../types";
import { buildSessionCookie } from "../session-cookie";
import { resetMockStore } from "../store";

const STUDENT = "u-005";
const OTHER_STUDENT = "u-006";
const TEACHER = "u-002";
const ATTEMPT = "att-02";

const asStudent = buildSessionCookie(STUDENT);
const asOtherStudent = buildSessionCookie(OTHER_STUDENT);
const asTeacher = buildSessionCookie(TEACHER);

const VALID_BODY = {
  attemptId: ATTEMPT,
  mode: "dds",
  message: "Почему снижен балл за время?",
  history: [],
};

function chat(body: unknown, cookie?: string): Request {
  const isRaw = typeof body === "string";
  return new Request("http://localhost/api/v1/ai/chat", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: isRaw ? body : JSON.stringify(body),
  });
}

async function errorOf(response: Response): Promise<{ status: number; code: string; message: string }> {
  return { status: response.status, ...((await response.json()) as ApiErrorBody).error };
}

const withBody = (patch: Record<string, unknown>) => ({ ...VALID_BODY, ...patch });

beforeEach(() => {
  resetMockStore();
});

describe("чат разбора попытки: права", () => {
  it("аноним → 401; обучающийся-владелец → 200 (пара)", async () => {
    expect((await errorOf(await chatRoute(chat(VALID_BODY)))).status).toBe(401);
    expect((await chatRoute(chat(VALID_BODY, asStudent))).status).toBe(200);
  });

  it("преподаватель → 403; чужой обучающийся → 403; свой → 200", async () => {
    expect((await errorOf(await chatRoute(chat(VALID_BODY, asTeacher)))).status).toBe(403);
    expect((await errorOf(await chatRoute(chat(VALID_BODY, asOtherStudent)))).status).toBe(403);
    expect((await chatRoute(chat(VALID_BODY, asStudent))).status).toBe(200);
  });

  it("попытки нет → 404; своя попытка → 200 (пара)", async () => {
    const missing = await errorOf(await chatRoute(chat(withBody({ attemptId: "att-404" }), asStudent)));
    expect(missing).toMatchObject({ status: 404, code: "notFound" });
    expect((await chatRoute(chat(VALID_BODY, asStudent))).status).toBe(200);
  });
});

describe("чат разбора попытки: проверка тела", () => {
  it("пустое или из одних пробелов сообщение → 400; после trim в пределах 1…1000 → 200", async () => {
    expect((await errorOf(await chatRoute(chat(withBody({ message: "" }), asStudent)))).status).toBe(400);
    expect((await errorOf(await chatRoute(chat(withBody({ message: "   " }), asStudent)))).status).toBe(400);
    expect((await chatRoute(chat(withBody({ message: "  вопрос  " }), asStudent))).status).toBe(200);
  });

  it("1000 символов проходят, 1001 — нет", async () => {
    const limit = "я".repeat(1000);
    expect((await chatRoute(chat(withBody({ message: limit }), asStudent))).status).toBe(200);
    expect((await errorOf(await chatRoute(chat(withBody({ message: `${limit}я` }), asStudent)))).status).toBe(
      400,
    );
  });

  it("неизвестный mode → 400; operator112 → 200 (пара)", async () => {
    expect((await errorOf(await chatRoute(chat(withBody({ mode: "teacher" }), asStudent)))).status).toBe(400);
    expect((await chatRoute(chat(withBody({ mode: "operator112" }), asStudent))).status).toBe(200);
  });

  it("history: роль не user/assistant → 400; больше 6 реплик → 400; 6 реплик → 200 (пара)", async () => {
    const badRole = [{ role: "system", content: "x" }];
    expect((await errorOf(await chatRoute(chat(withBody({ history: badRole }), asStudent)))).status).toBe(
      400,
    );
    const seven = Array.from({ length: 7 }, () => ({ role: "user", content: "вопрос" }));
    expect((await errorOf(await chatRoute(chat(withBody({ history: seven }), asStudent)))).status).toBe(400);
    const six = seven.slice(0, 6);
    expect((await chatRoute(chat(withBody({ history: six }), asStudent))).status).toBe(200);
  });

  it("реплика history длиннее 1000 символов → 400; тело не JSON → 400; тело — JSON-объект → 200 (пара)", async () => {
    const long = [{ role: "assistant", content: "а".repeat(1001) }];
    expect((await errorOf(await chatRoute(chat(withBody({ history: long }), asStudent)))).status).toBe(400);
    expect((await errorOf(await chatRoute(chat("{не json", asStudent)))).status).toBe(400);
    expect((await chatRoute(chat(VALID_BODY, asStudent))).status).toBe(200);
  });
});

describe("чат разбора попытки: шаблонный ответ", () => {
  it("тело ответа — reply, source template, provider и modelName null", async () => {
    const response = await chatRoute(chat(VALID_BODY, asStudent));
    const body = (await response.json()) as ChatResponse;
    expect(Object.keys(body).sort()).toEqual(["modelName", "provider", "reply", "source"]);
    expect(body).toMatchObject({ source: "template", provider: null, modelName: null });
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body.reply.length).toBeLessThanOrEqual(600);
  });

  it("ответ детерминирован: тот же вопрос дает тот же текст и итог попытки 95 баллов", async () => {
    const first = (await (await chatRoute(chat(VALID_BODY, asStudent))).json()) as ChatResponse;
    const second = (await (await chatRoute(chat(VALID_BODY, asStudent))).json()) as ChatResponse;
    expect(second.reply).toBe(first.reply);
    expect(first.reply).toContain("95");
  });

  it("текст вопроса не эхоится в ответе", async () => {
    const marker = "УНИКАЛЬНАЯ-ФРАЗА-7731";
    const body = (await (
      await chatRoute(chat(withBody({ message: marker }), asStudent))
    ).json()) as ChatResponse;
    expect(body.reply).not.toContain(marker);
  });
});
