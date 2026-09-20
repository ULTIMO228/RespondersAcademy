// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getEvaluation } from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import { POST as postProgress } from "../../../../../app/api/mock/attempts/[id]/progress/route";
import { POST as postAttempt } from "../../../../../app/api/mock/cards/[id]/attempt/route";
import { POST as postCall } from "../../../../../app/api/mock/cards/[id]/calls/route";
import { POST as postSession } from "../../../../../app/api/mock/sessions/route";
import { GET as getFeed } from "../../../../../app/api/mock/sessions/[id]/feed/route";
import { POST as startSession } from "../../../../../app/api/mock/sessions/[id]/start/route";
import type { CardAttemptResponse, CardEvent } from "../../types";
import { resetMockStore } from "../store";
import { listStoredSessions } from "../store-training";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body: unknown): Request {
  return new Request("http://localhost/api/mock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function openAttempt(cardId: string, studentId: string) {
  const response = await postAttempt(post({ studentId }), context(cardId));
  return { status: response.status, body: (await response.json()) as CardAttemptResponse };
}

beforeEach(() => resetMockStore());

describe("POST /api/mock/cards/[id]/attempt (T2.3-01)", () => {
  it("создаёт попытку в идущем занятии курсанта; повторное открытие не дублирует CardEvent", async () => {
    const first = await openAttempt("c-094", "u-005");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ sessionId: "ses-2026-09-17-demo", created: true });
    expect(first.body.attempt).toMatchObject({
      cardId: "c-094",
      studentId: "u-005",
      completedAt: "",
      statuses: [],
    });
    expect(first.body.attempt.openedAt).toMatch(/\+03:00$/);
    const second = await openAttempt("c-094", "u-005");
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ created: false, attempt: { id: first.body.attempt.id } });
    const attempts = listStoredSessions()
      .flatMap((session) => session.cardEvents)
      .filter((event) => event.cardId === "c-094" && event.studentId === "u-005");
    expect(attempts).toHaveLength(1);
  });

  it("продолжает существующую попытку из занятия (att-01) и считает реакцию от выдачи ленты", async () => {
    expect((await openAttempt("c-063", "u-005")).body).toMatchObject({
      created: false,
      attempt: { id: "att-01" },
    });
    const fromFlow = await openAttempt("c-095", "u-005");
    expect(fromFlow.body.attempt.primaryReactionMs).toBeGreaterThan(0);
  });

  it("у курсанта два идущих занятия: попытка уходит тому, которое выдало карточку", async () => {
    const created = await postSession(
      post({
        teacherId: "u-003",
        studentIds: ["u-005"],
        scenarioIds: ["s-002"],
        mode: "practice",
        cardSource: "generated",
        cardFlow: [{ cardId: "c-004", studentId: "u-005", issuedAt: "2026-09-17T11:00:00+03:00", level: 2 }],
      }),
    );
    const { id } = (await created.json()) as { id: string };
    await startSession(post({}), context(id));
    /* Рядом идёт демо-занятие ses-2026-09-17-demo с тем же курсантом — попытка не должна попасть в него. */
    expect((await openAttempt("c-004", "u-005")).body.sessionId).toBe(id);
  });

  it("курсант без идущего занятия — занятие самостоятельной практики", async () => {
    const { body } = await openAttempt("card-881412", "u-008");
    const session = listStoredSessions().find((item) => item.id === body.sessionId);
    expect(session).toMatchObject({ mode: "practice", state: "running", studentIds: ["u-008"] });
  });

  it("400 без studentId, 404 для неизвестной карточки", async () => {
    expect((await postAttempt(post({}), context("c-094"))).status).toBe(400);
    expect((await postAttempt(post({ studentId: "u-005" }), context("nope"))).status).toBe(404);
  });
});

describe("POST /api/mock/attempts/[id]/progress", () => {
  it("пишет статусы, текст и завершение; оценка и лента занятия видят попытку; софтфон пишет вызов", async () => {
    const { attempt } = (await openAttempt("c-094", "u-005")).body;
    const feedBefore = await getFeed(new Request("http://localhost/x"), context("ses-2026-09-17-demo"));
    expect(feedBefore.status).toBe(200);
    const call = await postCall(
      post({
        studentId: "u-005",
        toNumber: "102",
        startedAt: attempt.openedAt,
        endedAt: attempt.openedAt,
        transcript: [],
      }),
      context("c-094"),
    );
    expect(call.status).toBe(201);
    await postProgress(
      post({ status: { ddsStatus: "accepted", at: attempt.openedAt } }),
      context(attempt.id),
    );
    await postProgress(post({ enteredText: { dispatcherAction: "Сообщение принято" } }), context(attempt.id));
    const done = await postProgress(post({ completedAt: attempt.openedAt }), context(attempt.id));
    const updated = (await done.json()) as CardEvent;
    expect(updated.statuses).toHaveLength(1);
    expect(updated.enteredText.dispatcherAction).toBe("Сообщение принято");
    expect(updated.completedAt).toBe(attempt.openedAt);
    expect(updated.calls).toHaveLength(1);
    expect((await getEvaluation(new Request("http://localhost/x"), context(attempt.id))).status).toBe(200);
  });

  it("404 для неизвестной попытки, 400 для мусора в теле", async () => {
    expect(
      (await postProgress(post({ completedAt: "2026-09-17T11:00:00+03:00" }), context("att-999"))).status,
    ).toBe(404);
    expect((await postProgress(post({ completedAt: "вчера" }), context("att-01"))).status).toBe(400);
  });
});
