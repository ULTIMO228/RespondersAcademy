// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as postLinksRoute } from "../../../../../app/api/mock/cards/[id]/links/route";
import { GET as getRecordingsRoute } from "../../../../../app/api/mock/cards/[id]/recordings/route";
import { POST as postReminderRoute } from "../../../../../app/api/mock/cards/[id]/reminders/route";
import { GET as getCardRoute } from "../../../../../app/api/mock/cards/[id]/route";
import { GET as getSmsRoute, POST as postSmsRoute } from "../../../../../app/api/mock/cards/[id]/sms/route";
import { POST as postStatusRoute } from "../../../../../app/api/mock/cards/[id]/status/route";
import { POST as postWorkLineRoute } from "../../../../../app/api/mock/cards/[id]/worklines/route";
import type { ApiErrorBody, CardDetails, CardLinksResponse, CardSms, CardStatusEvent } from "../../types";
import { isRecordingDuration } from "../card-actions";
import { readCards } from "../readers";
import { resetMockStore } from "../store";

const FIXTURE_ID = "card-881412";
const FIXTURE_WITH_SMS_ID = "card-36814859";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function call(handler: Handler, id: string, body?: unknown): Promise<Response> {
  const init: RequestInit = body === undefined ? {} : { method: "POST", body: JSON.stringify(body) };
  return handler(new Request(`http://localhost/api/mock/cards/${id}`, init), {
    params: Promise.resolve({ id }),
  });
}

async function errorOf(response: Response): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

async function details(id: string): Promise<CardDetails> {
  return (await call(getCardRoute, id)).json();
}

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /cards/[id]/status", () => {
  it("notAccepted без комментария → 400 (сохранение заблокировано), store не меняется", async () => {
    const response = await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "notAccepted" });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toContain("обязателен комментарий");
    expect((await details(FIXTURE_ID)).runtime.statusEvents).toEqual([]);
  });

  it("с comment и dutyNumber → 200, событие видно в GET /cards/[id]", async () => {
    const body = { ddsStatus: "notAccepted", comment: "Нет наряда", dutyNumber: "Н-15" };
    const response = await call(postStatusRoute, FIXTURE_ID, body);
    expect(response.status).toBe(200);
    const event: CardStatusEvent = await response.json();
    expect(event).toMatchObject({ ...body, cardId: FIXTURE_ID, at: "2026-09-19T12:00:00+03:00" });
    expect(event.id).toMatch(/^st-\d{3}$/);
    expect((await details(FIXTURE_ID)).runtime.statusEvents).toEqual([event]);
  });

  it("последовательность по reference.next: полный цикл проходит, нарушение → 409 invalidTransition", async () => {
    for (const ddsStatus of ["accepted", "responseStarted", "arrived", "workInProgress", "workDone"]) {
      expect((await call(postStatusRoute, "c-010", { ddsStatus })).status).toBe(200);
    }
    const skip = await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "arrived" });
    expect(skip.status).toBe(409);
    expect((await errorOf(skip)).code).toBe("invalidTransition");
  });

  it("неизвестный статус → 400, неизвестная карточка → 404", async () => {
    expect((await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "nope" })).status).toBe(400);
    expect((await call(postStatusRoute, "card-000", { ddsStatus: "accepted" })).status).toBe(404);
  });

  it("машина статусов справочника (T1.2-01): первичный — только accepted | notAccepted, workDone финальный", async () => {
    const first = await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "workDone" });
    expect(first.status).toBe(409);
    expect(await errorOf(first)).toMatchObject({ code: "invalidTransition" });
    expect(
      (await errorOf(await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "arrived" }))).message,
    ).toContain("Первичный статус");
    for (const ddsStatus of ["accepted", "responseStarted", "arrived", "workInProgress", "workDone"]) {
      await call(postStatusRoute, FIXTURE_ID, { ddsStatus });
    }
    const afterFinal = await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "accepted" });
    expect(afterFinal.status).toBe(409);
    expect((await details(FIXTURE_ID)).runtime.statusEvents).toHaveLength(5);
  });

  it("workRefused без комментария → 400 validationFailed; с комментарием — 200", async () => {
    for (const ddsStatus of ["accepted", "responseStarted", "arrived", "workInProgress"]) {
      await call(postStatusRoute, FIXTURE_ID, { ddsStatus });
    }
    const bare = await call(postStatusRoute, FIXTURE_ID, { ddsStatus: "workRefused" });
    expect(bare.status).toBe(400);
    expect(await errorOf(bare)).toMatchObject({ code: "validationFailed" });
    const withComment = { ddsStatus: "workRefused", comment: "Отказ заявителя" };
    expect((await call(postStatusRoute, FIXTURE_ID, withComment)).status).toBe(200);
  });

  it("ddsStatus не строка → 400", async () => {
    expect((await call(postStatusRoute, FIXTURE_ID, { ddsStatus: 5 })).status).toBe(400);
  });
});

describe("POST /cards/[id]/links", () => {
  it("оригинал c-002 → цепочка: главная c-002 + подчинённая c-061", async () => {
    const body: CardLinksResponse = await (await call(postLinksRoute, "c-002", {})).json();
    expect(body.chain).toEqual([
      { cardId: "c-002", role: "main" },
      { cardId: "c-061", role: "subordinate" },
    ]);
  });

  it("дубль c-080 → та же цепочка с главной c-074", async () => {
    const body: CardLinksResponse = await (await call(postLinksRoute, "c-080", {})).json();
    expect(body.chain.map((link) => `${link.role}:${link.cardId}`)).toEqual([
      "main:c-074",
      "subordinate:c-077",
      "subordinate:c-080",
      "subordinate:c-083",
    ]);
  });

  it("без связей и для фикстур → пустая цепочка; моки не мутируются", async () => {
    const snapshot = JSON.stringify(readCards());
    expect(((await (await call(postLinksRoute, "c-001", {})).json()) as CardLinksResponse).chain).toEqual([]);
    expect(((await (await call(postLinksRoute, FIXTURE_ID, {})).json()) as CardLinksResponse).chain).toEqual(
      [],
    );
    expect(JSON.stringify(readCards())).toBe(snapshot);
  });
});

describe("POST /cards/[id]/worklines и /reminders", () => {
  const workLine = {
    service: "ДДС ЮАО",
    calledTo: "дежурный",
    person: "Петров",
    message: "Передано",
    confirmed: true,
  };

  it("отработка → 201 wl-NNN, отдаётся в GET карточки", async () => {
    const response = await call(postWorkLineRoute, FIXTURE_ID, workLine);
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      id: "wl-001",
      cardId: FIXTURE_ID,
      operator: "оп. 1",
      service: "ДДС ЮАО",
    });
    expect((await details(FIXTURE_ID)).runtime.workLines).toEqual([created]);
  });

  it("отработка без подтверждения или без обязательного поля → 400", async () => {
    expect((await call(postWorkLineRoute, FIXTURE_ID, { ...workLine, confirmed: false })).status).toBe(400);
    expect((await call(postWorkLineRoute, FIXTURE_ID, { ...workLine, person: " " })).status).toBe(400);
  });

  it("напоминание → 201 rem-NNN, отдаётся в GET; некорректное время → 400", async () => {
    const response = await call(postReminderRoute, "c-005", {
      text: "Перезвонить",
      remindAt: "2026-09-19T12:30:00+03:00",
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.id).toBe("rem-001");
    expect((await details("c-005")).runtime.reminders).toEqual([created]);
    expect((await call(postReminderRoute, "c-005", { text: "x", remindAt: "завтра" })).status).toBe(400);
  });
});

describe("GET/POST /cards/[id]/sms и GET /recordings", () => {
  it("GET отдаёт smsList фикстуры; POST добавляет исходящее с меткой +03:00, видно в повторном GET", async () => {
    const initial: CardSms[] = await (await call(getSmsRoute, FIXTURE_WITH_SMS_ID)).json();
    expect(initial.length).toBeGreaterThan(0);
    const response = await call(postSmsRoute, FIXTURE_WITH_SMS_ID, { text: "Бригада выехала" });
    expect(response.status).toBe(201);
    const sent: CardSms = await response.json();
    expect(sent).toMatchObject({ direction: "outgoing", text: "Бригада выехала" });
    expect(sent.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/);
    const after: CardSms[] = await (await call(getSmsRoute, FIXTURE_WITH_SMS_ID)).json();
    expect(after).toHaveLength(initial.length + 1);
    expect(after.at(-1)).toEqual(sent);
  });

  it("пустой текст SMS → 400; неизвестная карточка → 404", async () => {
    expect((await call(postSmsRoute, FIXTURE_ID, { text: "" })).status).toBe(400);
    expect((await call(getSmsRoute, "card-000")).status).toBe(404);
  });

  it("записей нет → []; формат длительности «мм:сс»", async () => {
    const response = await call(getRecordingsRoute, FIXTURE_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(isRecordingDuration("03:15")).toBe(true);
    expect(isRecordingDuration("3:15")).toBe(false);
    expect(isRecordingDuration("03:75")).toBe(false);
  });
});
