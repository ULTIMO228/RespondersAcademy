import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardDraft } from "../types";
import {
  answerAttempt,
  fetchTicketAudioFile,
  getNotificationList,
  getOperatorEvaluation,
  getTicketAudio,
  searchStreets,
  sendAttemptEvent,
  submitAttempt,
  ticketAudioFileUrl,
} from "./operator112";

function stubFetch(status: number, payload: unknown, contentType = "application/json") {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(body, { status, headers: { "content-type": contentType } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>) {
  const [input, init] = fetchMock.mock.calls[0];
  return {
    url: new URL(String(input), "http://localhost"),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
}

const DRAFT: CardDraft = {
  applicant: { name: "Сидорова А. В.", status: "очевидец" },
  phones: { aon: "916-126-34-71", provided: "", onSite: "" },
  address: {
    formal: "Москва, ул. Грина",
    street: "ул. Грина",
    house: "11",
    okrug: "",
    raion: "",
    descriptive: "",
    source: "directory",
  },
  what: {
    pollAnswers: "",
    signs: ["жилой дом"],
    flags: [],
    finalType: "",
    classifierCode: "",
    casualties: { injured: false, ambulanceRefused: false, blocked: false },
  },
  description: "Горит балкон",
  emergency: { chs: false, chp: false },
  notificationList: [{ serviceId: "101", addedBy: "auto" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("клиент режима 112 /api/v1/operator112", () => {
  it("answerAttempt: POST …/answer без тела", async () => {
    const fetchMock = stubFetch(200, { id: "att-1", state: "answered" });
    expect((await answerAttempt("att-1")).state).toBe("answered");
    const { url, method, body } = sent(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/operator112/attempts/att-1/answer");
    expect(body).toBeUndefined();
  });

  it("sendAttemptEvent: тип и payload в теле; payload по умолчанию — пустой объект", async () => {
    const fetchMock = stubFetch(201, { id: "ev-1", type: "replay", at: "t", payload: {} });
    await sendAttemptEvent("att-1", { type: "replay" });
    expect(sent(fetchMock).body).toEqual({ type: "replay", payload: {} });
    const second = stubFetch(201, { id: "ev-2" });
    await sendAttemptEvent("att-1", { type: "signSelected", payload: { signs: ["балкон"] } });
    expect(sent(second).body).toEqual({ type: "signSelected", payload: { signs: ["балкон"] } });
  });

  it("getNotificationList: GET, signs — повторные ключи, classifierCode — query", async () => {
    const fetchMock = stubFetch(200, {
      finalType: "",
      classifierCode: "",
      group: "",
      services: [],
      conditional: [],
    });
    await getNotificationList("att-1", { signs: ["жилой дом", "балкон"], classifierCode: "1050201" });
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/operator112/attempts/att-1/notification-list");
    expect(url.searchParams.getAll("signs")).toEqual(["жилой дом", "балкон"]);
    expect(url.searchParams.get("classifierCode")).toBe("1050201");
  });

  it("getNotificationList без предпросмотра — без query", async () => {
    const fetchMock = stubFetch(200, {});
    await getNotificationList("att-1");
    expect(sent(fetchMock).url.search).toBe("");
  });

  it("submitAttempt: черновик уходит как есть; 400 и 409 — русские сообщения сервера", async () => {
    const fetchMock = stubFetch(200, { attempt: { id: "att-1" }, card: {}, evaluationId: "att-1" });
    expect((await submitAttempt("att-1", DRAFT)).evaluationId).toBe("att-1");
    expect(sent(fetchMock).body).toEqual(DRAFT);
    stubFetch(400, { error: { code: "validationFailed", message: "Заполните адресный блок" } });
    await expect(submitAttempt("att-1", DRAFT)).rejects.toMatchObject({
      status: 400,
      code: "validationFailed",
      message: "Заполните адресный блок",
    });
    stubFetch(409, { error: { code: "invalidTransition", message: "Карточка уже отправлена" } });
    await expect(submitAttempt("att-1", DRAFT)).rejects.toMatchObject({
      status: 409,
      message: "Карточка уже отправлена",
    });
  });

  it("getOperatorEvaluation: 403 чужой попытки — ApiError forbidden", async () => {
    const fetchMock = stubFetch(403, { error: { code: "forbidden", message: "Только свои попытки" } });
    await expect(getOperatorEvaluation("att-9")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/operator112/attempts/att-9/evaluation");
  });

  it("searchStreets: короче 3 символов запрос не уходит; от 3 — GET /streets?q&limit", async () => {
    const fetchMock = stubFetch(200, [{ id: 1, name: "Грина", type: "улица" }]);
    expect(await searchStreets("Гр")).toEqual([]);
    expect(await searchStreets("  Гр ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await searchStreets("Грин", 5)).toHaveLength(1);
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/streets");
    expect(url.searchParams.get("q")).toBe("Грин");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("searchStreets: 400 сервера доходит ApiError (порог q)", async () => {
    stubFetch(400, { error: { code: "validationFailed", message: "Параметр «q» — не менее 3 символов" } });
    await expect(searchStreets("Грин")).rejects.toMatchObject({ status: 400 });
  });

  it("getTicketAudio и адрес файла записи", async () => {
    const fetchMock = stubFetch(200, { cardId: "c-010", status: "pending", emergency: true });
    expect((await getTicketAudio("c-010")).emergency).toBe(true);
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/tickets/c-010/audio");
    expect(ticketAudioFileUrl("c-010")).toBe("/api/v1/tickets/c-010/audio/file");
  });

  it("fetchTicketAudioFile: один запрос, тело — Blob; 404 и 409 экзамена — ApiError с кодом сервера", async () => {
    const fetchMock = stubFetch(200, "RIFF", "audio/wav");
    const blob = await fetchTicketAudioFile("c-010");
    expect(blob.size).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stubFetch(404, {
      error: { code: "notFound", message: "Аудиозапись не готова: используйте расшифровку" },
    });
    await expect(fetchTicketAudioFile("c-010")).rejects.toMatchObject({ status: 404, code: "notFound" });
    stubFetch(409, { error: { code: "conflict", message: "В экзамене запись прослушивается один раз" } });
    await expect(fetchTicketAudioFile("c-010")).rejects.toMatchObject({ status: 409, code: "conflict" });
  });
});
