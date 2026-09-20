/*
 * T3.3-02…T3.3-06: дашборд на живой ленте — шапка с временем от старта, плитки, лента, очередь,
 * баннер потери связи с сохранением данных, завершение занятия через мок-слой.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestApi, createTestClock, withDeps } from "@/widgets/monitor-grid";
import type { TestApiOverrides } from "@/widgets/monitor-grid";
import type { SessionControlApi } from "@/features/session-control";
import type {
  SessionContract,
  SessionControlRequest,
  SessionFeedEvent,
  SessionFeedResponse,
} from "@/shared/api";

import { DashboardScreen } from "./DashboardScreen";

const TEACHER = "u-002";
const IVANOV = "u-005";
const START = "2026-09-17T11:20:00+03:00";
const NOW = "2026-09-17T11:22:00+03:00";

const session = {
  id: "ses-2026-09-17-demo",
  teacherId: TEACHER,
  studentIds: [IVANOV],
  scenarioIds: ["s-032"],
  mode: "practice",
  cardSource: "generated",
  state: "running",
  startedAt: START,
  finishedAt: null,
  cardEvents: [],
  cardFlow: [{ cardId: "c-095", studentId: IVANOV, issuedAt: START, level: 2 }],
} as unknown as SessionContract;

const issued: SessionFeedEvent = {
  kind: "cardIssued",
  at: START,
  studentId: IVANOV,
  cardId: "c-095",
  level: 2,
};

const reference = {
  ddsStatuses: [{ status: "accepted", title: "Принята", requiresComment: false, next: [] }],
  internalNumbers: [],
  services: [],
  serviceStatuses: [],
};

type ControlFake = SessionControlApi & { calls: SessionControlRequest[] };

/** Мок-слой управления занятием: pause/resume/issue/report + stop (T3.2-11, T3.2-12). */
function createControlApi(): ControlFake {
  const calls: SessionControlRequest[] = [];
  let current = session;
  let paused = false;
  const response = async () => ({
    session: current,
    plan: null,
    paused,
    pausedAt: paused ? NOW : null,
    pendingCount: 1,
  });
  return {
    calls,
    getSessionControl: response,
    postSessionControl: async (_sessionId: string, body: SessionControlRequest) => {
      calls.push(body);
      if (body.action === "pause") paused = true;
      if (body.action === "resume") paused = false;
      if (body.action === "report") current = { ...current, state: "reported" };
      return response();
    },
    stopSession: async () => current,
  };
}

function setup(overrides: TestApiOverrides = {}) {
  const testClock = createTestClock(Date.parse(NOW));
  const api = createTestApi({
    listSessions: vi.fn(async () => [session]),
    getReference: vi.fn(async () => reference),
    listUsers: vi.fn(async () => [
      { id: IVANOV, login: "ivanov", fullName: "Иванов Сергей Петрович", role: "student", armNumber: 1 },
    ]),
    getCard: vi.fn(async () => ({
      kind: "fixture",
      card: { id: "card-1", number: 36814850, what: { finalType: "ДТП" } },
      runtime: {},
    })),
    getSessionFeed: vi.fn(async (): Promise<SessionFeedResponse> => ({
      sessionId: session.id,
      at: "2026-09-17T11:22:00+03:00",
      events: [issued],
    })),
    ...overrides,
  });
  const controlApi = createControlApi();
  const view = render(
    withDeps(
      { api, clock: testClock.clock },
      <DashboardScreen teacherId={TEACHER} teacherName="Морозова Е. С." controlApi={controlApi} />,
    ),
  );
  return { api, controlApi, testClock, view };
}

describe("DashboardScreen (T3.3-03…T3.3-06)", () => {
  it("шапка занятия: ID, состояние и живое время от старта", async () => {
    setup();
    expect(await screen.findByText(/ID ses-2026-09-17-demo/)).toBeInTheDocument();
    expect(screen.getByText("Идёт занятие")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /от старта занятия/ })).toHaveTextContent("02:00");
  });

  it("плитка курсанта и очередь выдачи строятся из ленты и cardFlow", async () => {
    setup();
    const tile = await screen.findByRole("link", { name: /Иванов/ });
    expect(tile).toHaveAttribute("href", `/teacher/monitor/${IVANOV}`);
    /* Реакция 2 мин без открытия карточки — норматив 30 с превышен. */
    expect(tile).toHaveAttribute("data-exceeded", "true");
    expect(await screen.findByText(/Карточка 36814850 выдана: Иванов/)).toBeInTheDocument();
    expect(screen.getByText("выдана")).toBeInTheDocument();
  });

  it("сбой сети: баннер поверх интерфейса, загруженные данные и таймеры остаются", async () => {
    const getSessionFeed = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: session.id, at: "at-1", events: [issued] })
      .mockRejectedValue(new Error("network"));
    const { testClock } = setup({ getSessionFeed });
    await screen.findByText(/Карточка 36814850 выдана: Иванов/);
    await act(async () => {
      testClock.runAll();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Соединение потеряно/));
    expect(screen.getByText(/Карточка 36814850 выдана: Иванов/)).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /от старта занятия/ })).toBeInTheDocument();
  });

  it("управление выдачей смонтировано: пауза и внеочередная карточка курсанту (T3.2-11)", async () => {
    const { controlApi } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Приостановить выдачу" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Возобновить выдачу" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Выдать сейчас" }));
    await waitFor(() =>
      expect(controlApi.calls).toEqual([{ action: "pause" }, { action: "issue", studentId: IVANOV }]),
    );
  });

  it("«Завершить занятие» вызывает мок-слой, баннер ведёт к отчёту и переводит занятие в reported", async () => {
    const stopSession = vi.fn(async () => ({ ...session, state: "finished" }) as SessionContract);
    const { api, controlApi } = setup({ stopSession });
    await screen.findByText(/ID ses-2026-09-17-demo/);
    fireEvent.click(screen.getByRole("button", { name: "Завершить занятие" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Завершить" }));
    await waitFor(() => expect(stopSession).toHaveBeenCalledWith(session.id));
    expect(api.listSessions).toHaveBeenCalled();
    /* После завершения кнопка завершения уходит, появляется баннер «Сформировать отчёт». */
    const banner = await screen.findByRole("region", { name: "Занятие завершено" });
    expect(screen.queryByRole("button", { name: "Завершить занятие" })).toBeNull();
    const report = within(banner).getByRole("link", { name: "Сформировать отчёт" });
    expect(report).toHaveAttribute("href", `/teacher/reports/${session.id}`);
    fireEvent.click(report);
    await waitFor(() => expect(controlApi.calls).toEqual([{ action: "report" }]));
    expect(await screen.findByText("Отчёт по занятию сформирован")).toBeInTheDocument();
  });

  it("без идущего занятия — заглушка с переходом в мастер", async () => {
    setup({ listSessions: vi.fn(async () => []) });
    expect(await screen.findByText("Занятие не идёт")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /мастер занятия/ })).toHaveAttribute("href", "/teacher/session");
  });
});
