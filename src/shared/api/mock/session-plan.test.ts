// @vitest-environment node
/*
 * Расписание выдачи по настройкам мастера (T3.2-02, T3.2-04, T3.2-05, T3.2-09) и машина состояний занятия.
 * Занятия создаются публичным handler'ом POST /sessions, расписание строит POST /[id]/start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as startRoute } from "../../../../app/api/mock/sessions/[id]/start/route";
import { POST as stopRoute } from "../../../../app/api/mock/sessions/[id]/stop/route";
import { POST as createRoute } from "../../../../app/api/mock/sessions/route";
import type { Session, SessionPlan } from "../types";
import { readCards } from "./readers";
import { orderForStudent, paceMsForStudent } from "./session-plan";
import { canTransition, SESSION_TRANSITIONS } from "./session-state";
import { resetMockStore } from "./store";

const NOW = "2026-09-19T12:00:00+03:00";
const TEACHER = "u-002";
/** Курсант профиля «Мосгаз (учебный профиль)» (users.json). */
const GAS_STUDENT = "u-009";
/** Курсант профиля «ДДС района Чертаново Южное». */
const FIRE_STUDENT = "u-005";
/** Курсант без строки привязки («ДДС района Царицыно») — профильный фильтр к нему не применяется. */
const ANY_STUDENT = "u-013";
const GAS_GROUP = "Запах газа в помещении (в доме, в квартире)";
const GAS_CARD = "c-093";

const PLAN: SessionPlan = {
  categories: [],
  issueOrder: "manual",
  hints: false,
  timeNorms: { primaryReactionSec: 30, fullProcessingSec: 180 },
  maxGrammarErrors: 1,
  paceSec: 60,
  conveyor: false,
};

type WizardBody = {
  studentIds: string[];
  scenarioIds?: string[];
  cardSource?: Session["cardSource"];
  plan?: Partial<SessionPlan>;
};

async function createSession(body: WizardBody): Promise<Session> {
  const request = new Request("http://localhost/api/mock/sessions", {
    method: "POST",
    body: JSON.stringify({
      teacherId: TEACHER,
      scenarioIds: ["s-031"],
      mode: "practice",
      cardSource: "generated",
      ...body,
      plan: { ...PLAN, ...body.plan },
    }),
  });
  return (await (await createRoute(request)).json()) as Session;
}

function callById(
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
): Promise<Response> {
  const request = new Request(`http://localhost/api/mock/sessions/${id}`, { method: "POST" });
  return handler(request, { params: Promise.resolve({ id }) });
}

async function start(sessionId: string): Promise<Session> {
  return (await (await callById(startRoute, sessionId)).json()) as Session;
}

const issuedMs = (session: Session, studentId: string): number[] =>
  session.cardFlow
    .filter((item) => item.studentId === studentId)
    .map((item) => Date.parse(item.issuedAt))
    .sort((left, right) => left - right);

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("машина состояний занятия (T3.2-02)", () => {
  it("разрешены только переходы draft → configured → running → finished → reported", () => {
    expect(SESSION_TRANSITIONS).toEqual({
      draft: ["configured"],
      configured: ["running"],
      running: ["finished"],
      finished: ["reported"],
      reported: [],
    });
    expect(canTransition("configured", "running")).toBe(true);
    expect(canTransition("finished", "running")).toBe(false);
    expect(canTransition("running", "reported")).toBe(false);
  });

  it("stop → finished с finishedAt; повторный старт из finished → 409", async () => {
    const session = await createSession({ studentIds: [GAS_STUDENT] });
    await start(session.id);
    const stopped = (await (await callById(stopRoute, session.id)).json()) as Session;
    expect(stopped).toMatchObject({ state: "finished", finishedAt: NOW });
    expect((await callById(startRoute, session.id)).status).toBe(409);
  });
});

describe("расписание по темпу выдачи (T3.2-09)", () => {
  it("темп 60 сек: первая карточка в момент старта, далее с шагом 60 сек", async () => {
    const session = await start((await createSession({ studentIds: [ANY_STUDENT] })).id);
    const times = issuedMs(session, ANY_STUDENT);
    expect(session.startedAt).toBe(NOW);
    expect(times[0]).toBe(Date.parse(NOW));
    expect(times.map((value) => (value - times[0]) / 1000)).toEqual([0, 60, 120]);
  });

  it("конвейер не ограничен числом карточек сценария (сценарий В)", async () => {
    const plain = await start((await createSession({ studentIds: [ANY_STUDENT] })).id);
    resetMockStore();
    const conveyor = await start(
      (await createSession({ studentIds: [ANY_STUDENT], plan: { conveyor: true } })).id,
    );
    const plainCount = plain.cardFlow.length;
    expect(conveyor.cardFlow.length).toBeGreaterThan(plainCount);
    // Очередь зацикливается: карточки повторяются по кругу.
    expect(conveyor.cardFlow[plainCount].cardId).toBe(conveyor.cardFlow[0].cardId);
  });
});

describe("фильтры расписания (T3.2-04, T3.2-05)", () => {
  it("курсант с профилем «Мосгаз» получает только газовые карточки", async () => {
    const session = await start((await createSession({ studentIds: [GAS_STUDENT, FIRE_STUDENT] })).id);
    const cards = new Map(readCards().map((card) => [card.id, card.group]));
    const gasGroups = session.cardFlow
      .filter((item) => item.studentId === GAS_STUDENT)
      .map((item) => cards.get(item.cardId));
    expect(gasGroups.length).toBeGreaterThan(0);
    expect(new Set(gasGroups)).toEqual(new Set([GAS_GROUP]));
    // У курсанта профиля «Чертаново Южное» пересечения со сценарием нет — выдач нет.
    expect(session.cardFlow.filter((item) => item.studentId === FIRE_STUDENT)).toHaveLength(0);
  });

  it("категории занятия сужают выдачу до выбранных групп ЕКП", async () => {
    const session = await start(
      (await createSession({ studentIds: [GAS_STUDENT], plan: { categories: [GAS_GROUP] } })).id,
    );
    expect(session.cardFlow.map((item) => item.cardId)).toEqual([GAS_CARD]);
  });

  it("cardSource studentCreated выдаёт карточки, заполненные курсантами на прошлых занятиях", async () => {
    const session = await start(
      (await createSession({ studentIds: [ANY_STUDENT], cardSource: "studentCreated" })).id,
    );
    // В занятии ses-2026-09-16-01 курсанты заполняли c-063, c-093 и c-095 — это и есть пул.
    expect(new Set(session.cardFlow.map((item) => item.cardId))).toEqual(
      new Set(["c-063", "c-093", "c-095"]),
    );
  });
});

describe("адаптивная выдача (T3.2-06, Q&A в10)", () => {
  it("adaptive сортирует сценарии от простого к сложному", async () => {
    const session = await start(
      (
        await createSession({
          studentIds: [ANY_STUDENT],
          scenarioIds: ["s-032", "s-002"],
          plan: { issueOrder: "adaptive", categories: [] },
        })
      ).id,
    );
    const levels = session.cardFlow.map((item) => item.level);
    expect(levels).toEqual([...levels].sort((left, right) => left - right));
  });

  it("сильному курсанту (последние оценки ≥ 80) самые простые карточки уходят в конец", async () => {
    const session = await start(
      (
        await createSession({
          // У FIRE_STUDENT в моках две попытки со средним баллом 96,5 (att-01, att-02).
          studentIds: [FIRE_STUDENT],
          scenarioIds: ["s-002", "s-005"],
          plan: { issueOrder: "adaptive" },
        })
      ).id,
    );
    expect(session.cardFlow.map((item) => item.level)).toEqual([4, 2]);
  });

  it("слабому курсанту (последние оценки ≤ 60) темп снижается, простая карточка повторяется", () => {
    const cards = [
      { cardId: "c-001", level: 1, group: "A" },
      { cardId: "c-002", level: 3, group: "A" },
    ];
    expect(orderForStudent(cards, "adaptive", 55).map((card) => card.cardId)).toEqual([
      "c-001",
      "c-001",
      "c-002",
    ]);
    expect(paceMsForStudent({ ...PLAN, paceSec: 60 }, 55)).toBe(90_000);
    expect(paceMsForStudent({ ...PLAN, paceSec: 60 }, 90)).toBe(60_000);
    expect(orderForStudent(cards, "manual", 55)).toEqual(cards);
  });

  it("manual сохраняет порядок сценариев мастера", async () => {
    const session = await start(
      (
        await createSession({
          studentIds: [ANY_STUDENT],
          scenarioIds: ["s-032", "s-002"],
          plan: { issueOrder: "manual" },
        })
      ).id,
    );
    expect(session.cardFlow[0].level).toBe(4);
  });
});
