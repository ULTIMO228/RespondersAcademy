/*
 * T3.3-07…T3.3-09: зеркало экрана курсанта (read-only), панель «Действия курсанта» с подсветкой отклонений,
 * транскрипт вызовов и ограничения доступа монитора.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestApi, createTestClock, withDeps } from "@/widgets/monitor-grid";
import type { TestApiOverrides } from "@/widgets/monitor-grid";
import { armCardFixtures, classifier, reference } from "@/shared/api";
import type { SessionContract, SessionFeedResponse } from "@/shared/api";

import { MonitorScreen } from "./MonitorScreen";

const TEACHER = "u-002";
const IVANOV = "u-005";
const STRANGER = "u-015";
const CARD = "c-095";
const NOW = "2026-09-17T11:22:00+03:00";
const OPENED_AT = "2026-09-17T11:20:09+03:00";

const fixture = armCardFixtures.find((card) => card.id === "card-36814850") ?? armCardFixtures[0];

const attempt = {
  id: "att-1",
  cardId: CARD,
  studentId: IVANOV,
  openedAt: OPENED_AT,
  primaryReactionMs: 9000,
  statuses: [{ ddsStatus: "accepted", at: "2026-09-17T11:20:23+03:00" }],
  servicesCalled: ["102"],
  completedAt: "",
  fullProcessingMs: 0,
  enteredText: {},
  calls: [
    {
      toNumber: "102",
      startedAt: "2026-09-17T11:21:02+03:00",
      endedAt: "2026-09-17T11:21:40+03:00",
      transcript: [
        { speaker: "dispatcher", text: "ДТП на Балаклавском", at: "2026-09-17T11:21:10+03:00" },
        { speaker: "ai", text: "Информация принята", at: "2026-09-17T11:21:30+03:00" },
      ],
    },
    {
      toNumber: "103",
      startedAt: "2026-09-17T11:21:48+03:00",
      endedAt: "2026-09-17T11:22:00+03:00",
      transcript: [],
    },
  ],
};

const session = {
  id: "ses-2026-09-17-demo",
  teacherId: TEACHER,
  studentIds: [IVANOV],
  scenarioIds: ["s-032"],
  mode: "practice",
  cardSource: "generated",
  state: "running",
  startedAt: "2026-09-17T11:20:00+03:00",
  finishedAt: null,
  cardFlow: [{ cardId: CARD, studentId: IVANOV, issuedAt: "2026-09-17T11:20:00+03:00", level: 2 }],
  cardEvents: [attempt],
} as unknown as SessionContract;

const feed: SessionFeedResponse = {
  sessionId: session.id,
  at: NOW,
  events: [
    { kind: "cardIssued", at: "2026-09-17T11:20:00+03:00", studentId: IVANOV, cardId: CARD, level: 2 },
    { kind: "cardOpened", at: OPENED_AT, studentId: IVANOV, cardId: CARD, attemptId: "att-1" },
    {
      kind: "statusChanged",
      at: "2026-09-17T11:20:23+03:00",
      studentId: IVANOV,
      cardId: CARD,
      attemptId: "att-1",
      mark: { ddsStatus: "accepted", at: "2026-09-17T11:20:23+03:00" },
    },
  ],
};

/** Эталон карточки: сначала звонок 103 (СМП), затем 102 — курсант позвонил 102 первым. */
const scenario = {
  id: "s-032",
  title: "ДТП с пострадавшими",
  cardIds: [CARD],
  etalon: {
    expectedActions: [`openCard:${CARD}`, "status:accepted", "call:103", "call:102", "status:workDone"],
  },
};

function setup(overrides: TestApiOverrides = {}, studentId = IVANOV) {
  const testClock = createTestClock(Date.parse(NOW));
  const api = createTestApi({
    listSessions: vi.fn(async () => [session]),
    getSessionFeed: vi.fn(async () => feed),
    getReference: vi.fn(async () => reference),
    listUsers: vi.fn(async () => [
      { id: IVANOV, login: "ivanov", fullName: "Иванов Сергей Петрович", role: "student", armNumber: 1 },
    ]),
    listScenarios: vi.fn(async () => [scenario]),
    getCard: vi.fn(async () => ({ kind: "fixture", card: fixture, runtime: {} })),
    getClassifier: vi.fn(async () =>
      classifier.filter((entry) => entry.code === fixture.what.classifierCode),
    ),
    ...overrides,
  });
  render(
    withDeps({ api, clock: testClock.clock }, <MonitorScreen teacherId={TEACHER} studentId={studentId} />),
  );
  return { api };
}

describe("MonitorScreen (T3.3-07…T3.3-09)", () => {
  it("зеркало показывает карточку курсанта без активных контролов", async () => {
    setup();
    const mirror = await screen.findByRole("group", { name: /только просмотр/ });
    expect(mirror).toBeDisabled();
    expect(within(mirror).getByText(new RegExp(String(fixture.number)))).toBeInTheDocument();
    within(mirror)
      .queryAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText("только просмотр")).toBeInTheDocument();
  });

  it("лента сужена до одного курсанта (мок-слой получает studentId)", async () => {
    const { api } = setup();
    await screen.findByRole("group", { name: /только просмотр/ });
    expect(api.getSessionFeed).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({ studentId: IVANOV }),
      expect.any(AbortSignal),
    );
  });

  it("«Действия курсанта»: нарушение порядка звонков подсвечено, эталон — из сценария", async () => {
    const { container } = { container: document.body };
    setup();
    await screen.findByText(/Эталон: ДТП с пострадавшими/);
    const outOfOrder = container.querySelector("[data-deviation='order']");
    expect(outOfOrder).toHaveTextContent("нарушен порядок");
    expect(container.querySelector("[data-deviation='pending']")).toHaveTextContent("ожидается");
  });

  it("транскрипт вызова точки C виден преподавателю", async () => {
    setup();
    expect(await screen.findByText(/ДТП на Балаклавском/)).toBeInTheDocument();
    expect(screen.getByText(/Информация принята/)).toBeInTheDocument();
    expect(screen.getByText(/00:38/)).toBeInTheDocument();
  });

  it("кнопка «Вернуться к классу» ведёт на /teacher", async () => {
    setup();
    const back = await screen.findByRole("link", { name: "Вернуться к классу" });
    expect(back).toHaveAttribute("href", "/teacher");
  });

  it("чужой курсант → вежливый отказ без данных", async () => {
    setup({}, STRANGER);
    expect(await screen.findByRole("alert")).toHaveTextContent(/не участвует в вашем занятии/);
    expect(screen.queryByRole("group", { name: /только просмотр/ })).not.toBeInTheDocument();
  });

  it("вне активного занятия → отказ с переходом к классу", async () => {
    setup({ listSessions: vi.fn(async () => []) });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Занятие не идёт/);
    expect(within(alert).getByRole("link", { name: "Вернуться к классу" })).toHaveAttribute(
      "href",
      "/teacher",
    );
  });
});
