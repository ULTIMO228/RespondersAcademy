import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionContract, SessionControlRequest, SessionControlResponse } from "@/shared/api";

import type { SessionControlApi } from "../model/deps";
import { SessionFinishBanner, NO_ATTEMPTS_NOTE } from "./SessionFinishBanner";
import { SessionFlowControl } from "./SessionFlowControl";

const SESSION_ID = "ses-001";
const STUDENTS = [
  { id: "u-005", fullName: "Иванов Сергей Петрович" },
  { id: "u-006", fullName: "Петрова Анна Дмитриевна" },
];

function buildSession(state: SessionContract["state"]): SessionContract {
  return {
    id: SESSION_ID,
    teacherId: "u-002",
    studentIds: STUDENTS.map((student) => student.id),
    scenarioIds: ["s-031"],
    mode: "practice",
    cardSource: "generated",
    cardFlow: [{ cardId: "c-093", studentId: "u-005", issuedAt: "2026-09-19T12:00:00+03:00", level: 3 }],
    state,
    startedAt: "2026-09-19T12:00:00+03:00",
    finishedAt: state === "running" ? null : "2026-09-19T12:30:00+03:00",
    cardEvents: [],
  };
}

type Fake = { api: SessionControlApi; calls: SessionControlRequest[] };

function createFake(): Fake {
  const calls: SessionControlRequest[] = [];
  let paused = false;
  const response = (): SessionControlResponse => ({
    session: buildSession("running"),
    plan: null,
    paused,
    pausedAt: paused ? "2026-09-19T12:10:00+03:00" : null,
    pendingCount: 2,
  });
  return {
    calls,
    api: {
      getSessionControl: async () => response(),
      postSessionControl: async (_sessionId, body) => {
        calls.push(body);
        if (body.action === "pause") paused = true;
        if (body.action === "resume") paused = false;
        return response();
      },
      stopSession: async () => buildSession("finished"),
    },
  };
}

async function renderControl(): Promise<Fake> {
  const fake = createFake();
  render(<SessionFlowControl sessionId={SESSION_ID} students={STUDENTS} api={fake.api} />);
  await waitFor(() => expect(screen.queryByText("Загрузка занятия…")).toBeNull());
  return fake;
}

describe("Управление выдачей во время занятия (T3.2-11)", () => {
  it("пауза и возобновление выдачи новых карточек", async () => {
    const fake = await renderControl();
    expect(screen.getByText("В расписании ещё 2 карточек")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Приостановить выдачу" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Возобновить выдачу" })).toBeVisible());
    expect(screen.getByText(/Выдача на паузе/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Возобновить выдачу" }));
    await waitFor(() => expect(fake.calls.map((call) => call.action)).toEqual(["pause", "resume"]));
  });

  it("принудительная выдача карточки выбранному курсанту", async () => {
    const fake = await renderControl();
    fireEvent.change(screen.getByLabelText("Выдать карточку курсанту"), { target: { value: "u-006" } });
    fireEvent.click(screen.getByRole("button", { name: "Выдать сейчас" }));
    await waitFor(() => expect(fake.calls).toEqual([{ action: "issue", studentId: "u-006" }]));
  });
});

describe("Переход к отчёту после завершения (T3.2-12)", () => {
  it("занятие без попыток: пометка «нет данных по попыткам» и ссылка на отчёт занятия", () => {
    render(<SessionFinishBanner session={buildSession("finished")} />);
    const banner = screen.getByRole("region", { name: "Занятие завершено" });
    expect(banner).toHaveTextContent(NO_ATTEMPTS_NOTE);
    expect(screen.getByRole("link", { name: "Сформировать отчёт" })).toHaveAttribute(
      "href",
      `/teacher/reports/${SESSION_ID}`,
    );
  });

  it("занятие с завершённой попыткой пометку не показывает", () => {
    const session = buildSession("finished");
    render(
      <SessionFinishBanner
        session={{
          ...session,
          cardEvents: [
            {
              id: "att-01",
              cardId: "c-093",
              studentId: "u-005",
              openedAt: "2026-09-19T12:01:00+03:00",
              primaryReactionMs: 12000,
              statuses: [],
              servicesCalled: [],
              completedAt: "2026-09-19T12:04:00+03:00",
              fullProcessingMs: 180000,
              enteredText: {},
              calls: [],
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText(NO_ATTEMPTS_NOTE)).toBeNull();
  });
});
