import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTelephonyStore } from "@/entities/service";
import type { TelephonyStore } from "@/entities/service";
import { sessionStore } from "@/entities/user";
import type { CallResponder } from "@/features/call-control";
import { cards, reference, scenarios, sessions } from "@/shared/api";
import type { CardDetails, IncidentCard, SessionContract } from "@/shared/api";
import type * as SharedApi from "@/shared/api";

import type { PhoneApi } from "../api/phoneApi";
import { PhoneScreen } from "./PhoneScreen";

const postCardCall = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  postCardCall,
}));

const STUDENT_ID = "u-005";
const RING_MS = 2000;

const api: PhoneApi = {
  getReference: async () => reference,
  listScenarios: async () => scenarios,
  getCard: async (cardId) => {
    const card = (cards as IncidentCard[]).find((candidate) => candidate.id === cardId);
    if (!card) throw new Error("not found");
    const runtime = { statusEvents: [], workLines: [], reminders: [], sms: [] };
    return { kind: "training", card, resolvedFixtureId: null, runtime } satisfies CardDetails;
  },
  listStudentSessions: async () => sessions as unknown as SessionContract[],
};

const responder: CallResponder = {
  answer: async () => ({ text: "Слушаю вас", voice: "male", speakerTitle: "Учебный номер Службы 103 (СМП)" }),
  reply: async () => ({
    text: "Я вас понял, информация принята",
    voice: "male",
    speakerTitle: "Учебный номер Службы 103 (СМП)",
  }),
};

let store: TelephonyStore;

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderScreen(
  props: { cardId?: string | null; mockLine?: "disconnected" | "error" | null } = {},
) {
  render(
    <PhoneScreen
      cardId={props.cardId ?? null}
      mockLine={props.mockLine ?? null}
      api={api}
      responder={responder}
      store={store}
    />,
  );
  await flush();
}

const lineStatus = () => screen.getByRole("button", { name: /Статус линии/ });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T08:21:00Z"));
  sessionStore.set({
    userId: STUDENT_ID,
    role: "student",
    token: "mock-u-005",
    twoFactorUsed: true,
    issuedAt: "2026-09-17T11:00:00+03:00",
  });
  store = createTelephonyStore();
  postCardCall.mockReset();
});

afterEach(() => {
  sessionStore.clear();
  vi.useRealTimers();
});

describe("/arm/phone — софтфон", () => {
  it("smoke: статус линии, вкладки, справочник из мока, журнал вызовов курсанта", async () => {
    await renderScreen();
    expect(lineStatus()).toHaveTextContent("доступен");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Контакты",
      "Звонки",
      "SMS",
      "Набор",
    ]);
    for (const entry of reference.internalNumbers)
      expect(screen.getByTitle(`Вызов ${entry.number}`)).toBeVisible();
    const journal = screen.getByRole("table", { name: "Журнал вызовов" });
    expect(
      within(journal)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/arm/card/c-093", "/arm/card/c-063"]);
  });

  it("статус линии от общего стора: открытая карточка → «недоступен»; мок-флаг → «не подключен»/«ошибка»", async () => {
    await renderScreen();
    act(() => store.cardOpened());
    expect(lineStatus()).toHaveTextContent("недоступен");
    act(() => store.cardClosed());
    await flush(10_000);
    expect(lineStatus()).toHaveTextContent("доступен");
  });

  it.each([
    ["disconnected", "не подключен"],
    ["error", "ошибка"],
  ] as const)("флаг мока ?mockLine=%s → «%s», вызовы заблокированы", async (mockLine, title) => {
    await renderScreen({ mockLine });
    expect(lineStatus()).toHaveTextContent(title);
    fireEvent.click(screen.getByTitle("Вызов 301"));
    expect(screen.getByRole("status")).toHaveTextContent("Линия не готова к вызовам");
    expect(screen.getByText("Активных вызовов нет")).toBeInTheDocument();
  });

  it("набор: «301» стартует вызов, «999» — «Абонент не найден», 2 знака не отправляются", async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole("tab", { name: "Набор" }));
    const field = screen.getByLabelText("Номер абонента");
    fireEvent.change(field, { target: { value: "30" } });
    expect(screen.getByRole("button", { name: /Позвонить/ })).toBeDisabled();
    fireEvent.change(field, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /Позвонить/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Абонент не найден");
    fireEvent.change(field, { target: { value: "301" } });
    fireEvent.click(screen.getByRole("button", { name: /Позвонить/ }));
    expect(screen.getByText("Вызов…")).toBeInTheDocument();
    expect(screen.getByText("Руководитель дежурной смены ДДС", { selector: "span" })).toBeInTheDocument();
  });

  it("из карточки c-095: подсвечены номера, ожидаемые по эталону сценария", async () => {
    await renderScreen({ cardId: "c-095" });
    const expected = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("data-expected") === "true")
      .map((item) => within(item).getByText(/^\d+$/).textContent);
    expect(expected).toEqual(["101", "102", "103"]);
    expect(screen.getAllByText(/Ожидается по эталону \(карточка 36814850, эталон сценария\)/)).toHaveLength(
      3,
    );
  });

  it("полный цикл: вызов → ответ ИИ → реплика → подтверждение → завершение → запись в попытку и журнал", async () => {
    postCardCall.mockImplementation(async (_cardId: string, body: { toNumber: string }) => ({
      sessionId: "ses-2026-09-17-demo",
      attemptId: "att-100",
      call: { ...body, id: "call-001", fromUserId: STUDENT_ID },
    }));
    await renderScreen({ cardId: "c-095" });
    fireEvent.click(screen.getByTitle("Вызов 103"));
    await flush(RING_MS);
    expect(screen.getByText("Разговор")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Реплика диспетчера"), {
      target: { value: "ДТП, трое пострадавших" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await flush(40_000);
    expect(within(screen.getByRole("log")).getByText("Я вас понял, информация принята")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Завершить/ }));
    await flush();
    expect(screen.getByText("Завершён")).toBeInTheDocument();
    expect(postCardCall).toHaveBeenCalledWith("c-095", {
      studentId: STUDENT_ID,
      toNumber: "103",
      startedAt: "2026-09-17T11:21:00+03:00",
      endedAt: "2026-09-17T11:21:42+03:00",
      transcript: [
        { speaker: "ai", text: "Слушаю вас", at: "2026-09-17T11:21:02+03:00" },
        { speaker: "dispatcher", text: "ДТП, трое пострадавших", at: "2026-09-17T11:21:02+03:00" },
        { speaker: "ai", text: "Я вас понял, информация принята", at: "2026-09-17T11:21:02+03:00" },
      ],
    });
    const firstRow = within(screen.getByRole("table", { name: "Журнал вызовов" })).getAllByRole("row")[1];
    expect(firstRow).toHaveTextContent("103");
    expect(firstRow).toHaveTextContent("0:42");
    expect(within(firstRow).getByRole("link")).toHaveAttribute("href", "/arm/card/c-095");
  });

  it("вкладки переключаются: «Звонки» — последние вызовы, «SMS» — честная заглушка", async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole("tab", { name: "Звонки" }));
    expect(screen.getByText("----- Вызовы -----")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel")).getByText("302")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "SMS" }));
    expect(screen.getByText(/Учебная заглушка/)).toBeInTheDocument();
    expect(screen.getByLabelText("Текст SMS (недоступно)")).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Контакты" }));
    expect(screen.getByPlaceholderText("Найти контакт")).toBeInTheDocument();
  });
});
