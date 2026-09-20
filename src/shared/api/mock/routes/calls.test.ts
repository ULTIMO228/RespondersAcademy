// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { POST as postCardCallRoute } from "../../../../../app/api/mock/cards/[id]/calls/route";
import { POST as postReplyRoute } from "../../../../../app/api/mock/calls/reply/route";
import type { AiResponse } from "../../ai-gateway";
import type { ApiErrorBody, CallReply, CardCallRequest, CardCallResponse } from "../../types";
import { resetMockStore } from "../store";
import { findStoredAttempt } from "../store-training";

/** att-01 из sessions.json: курсант u-005, карточка c-063, один вызов в моке. */
const ATTEMPT_ID = "att-01";
const CARD_ID = "c-063";
const STUDENT_ID = "u-005";

const CALL: CardCallRequest = {
  studentId: STUDENT_ID,
  toNumber: "301",
  startedAt: "2026-09-19T12:00:00+03:00",
  endedAt: "2026-09-19T12:00:40+03:00",
  transcript: [
    { speaker: "ai", text: "Слушаю вас", at: "2026-09-19T12:00:02+03:00" },
    { speaker: "dispatcher", text: "ДТП на Волгоградском проспекте", at: "2026-09-19T12:00:15+03:00" },
    { speaker: "ai", text: "Я вас понял, информация принята", at: "2026-09-19T12:00:30+03:00" },
  ],
};

function reply(body: unknown): Promise<Response> {
  return postReplyRoute(
    new Request("http://localhost/api/mock/calls/reply", { method: "POST", body: JSON.stringify(body) }),
  );
}

function record(cardId: string, body: unknown): Promise<Response> {
  return postCardCallRoute(
    new Request(`http://localhost/api/mock/cards/${cardId}/calls`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: cardId }) },
  );
}

async function errorOf(response: Response): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

beforeEach(() => {
  resetMockStore();
});

describe("POST /calls/reply", () => {
  it("answer → «Слушаю вас» из мока с маркером ИИ и пометкой голоса", async () => {
    const response = await reply({ toNumber: "301", turn: "answer" });
    expect(response.status).toBe(200);
    const payload: AiResponse<CallReply> = await response.json();
    expect(payload).toMatchObject({ origin: "ai", provider: "mock" });
    expect(payload.data).toEqual({
      text: "Слушаю вас",
      voice: "female",
      speakerTitle: "Руководитель дежурной смены ДДС",
    });
  });

  it("reply → подтверждение приёма по номеру из транскриптов мока", async () => {
    const accepted: AiResponse<CallReply> = await (
      await reply({ toNumber: "301", turn: "reply", text: "Пожар" })
    ).json();
    expect(accepted.data.text).toBe("Я вас понял, информация принята");
    const brigade: AiResponse<CallReply> = await (
      await reply({ toNumber: "302", turn: "reply", text: "Газ" })
    ).json();
    expect(brigade.data.text).toBe("Понял, бригада выезжает");
  });

  it("номер вне справочника → 404 «Абонент не найден»; пустая реплика → 400", async () => {
    const missing = await reply({ toNumber: "999", turn: "answer" });
    expect(missing.status).toBe(404);
    expect((await errorOf(missing)).message).toBe("Абонент не найден");
    const empty = await reply({ toNumber: "301", turn: "reply", text: " " });
    expect(empty.status).toBe(400);
    expect((await errorOf(empty)).code).toBe("validationFailed");
  });
});

describe("POST /cards/[id]/calls", () => {
  it("201: PhoneCall дописан в CardEvent.calls попытки курсанта", async () => {
    const response = await record(CARD_ID, CALL);
    expect(response.status).toBe(201);
    const payload: CardCallResponse = await response.json();
    expect(payload).toMatchObject({ sessionId: "ses-2026-09-16-01", attemptId: ATTEMPT_ID });
    expect(payload.call).toMatchObject({ fromUserId: STUDENT_ID, toNumber: "301" });
    expect(payload.call.id).toMatch(/^call-\d{3}$/);
    const attempt = findStoredAttempt(ATTEMPT_ID)?.attempt;
    expect(attempt?.calls).toHaveLength(2);
    expect(attempt?.calls.at(-1)?.transcript).toEqual(CALL.transcript);
  });

  it("нет попытки по карточке → 404; неизвестная карточка → 404", async () => {
    const noAttempt = await record("c-001", CALL);
    expect(noAttempt.status).toBe(404);
    expect((await errorOf(noAttempt)).message).toContain("не открыта");
    expect((await record("c-999", CALL)).status).toBe(404);
  });

  it("номер вне справочника → 404; мусор в датах и транскрипте → 400", async () => {
    expect((await record(CARD_ID, { ...CALL, toNumber: "999" })).status).toBe(404);
    expect((await record(CARD_ID, { ...CALL, endedAt: "вчера" })).status).toBe(400);
    expect((await record(CARD_ID, { ...CALL, endedAt: "2026-09-19T11:00:00+03:00" })).status).toBe(400);
    expect((await record(CARD_ID, { ...CALL, transcript: [{ speaker: "x" }] })).status).toBe(400);
    expect(findStoredAttempt(ATTEMPT_ID)?.attempt.calls).toHaveLength(1);
  });
});
