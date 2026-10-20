import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import type { OperatorAttempt } from "@/shared/api";

import type { Operator112Api } from "../api/operator112Api";
import { Operator112Screen } from "./Operator112Screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const OPENED = "2026-09-29T10:00:00+03:00";

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-100",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: OPENED,
    openedAt: OPENED,
    state: "ringing",
    events: [],
    replays: 0,
    hintsShown: 0,
    audio: { cardId: "c-010", status: "failed", transcript: "Горит", voice: "female", emergency: true },
    ...overrides,
  };
}

function makeApi() {
  return {
    getAssignment: vi.fn().mockResolvedValue({
      id: "asg-001",
      teacherId: "u-002",
      studentIds: ["u-005"],
      trainingMode: "operator112",
      format: "training",
      cardIds: ["c-010"],
      params: { norms: { answerSec: 30, submitSec: 180 } },
      state: "active",
      createdAt: OPENED,
      title: "Режим 112",
      progress: [],
    }),
    startAssignment: vi.fn().mockResolvedValue({ kind: "operator112", attempt: attempt() }),
    getClassifier: vi.fn().mockResolvedValue([]),
    answerAttempt: vi.fn().mockResolvedValue(attempt({ state: "answered", answeredAt: OPENED })),
    sendEvent: vi.fn().mockResolvedValue({ id: "ev-1", type: "callHidden", at: "t", payload: {} }),
    submitAttempt: vi.fn(),
    getEvaluation: vi.fn(),
    journal: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    matches: vi.fn().mockResolvedValue({ matches: [] }),
    getNotificationList: vi.fn().mockResolvedValue({
      finalType: "",
      classifierCode: "",
      group: "",
      services: [],
      conditional: [],
    }),
  } as unknown as Mocked<Operator112Api>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-29T10:00:30+03:00"));
});
afterEach(() => vi.useRealTimers());

describe("Operator112Screen: клавиатура и скринридер (FR-032)", () => {
  it("Shift+F2 прячет окно вызова, Shift+F1 возвращает его, Enter принимает вызов", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await screen.findByRole("dialog", { name: "Входящий звонок" });
    fireEvent.keyDown(document.body, { code: "F2", key: "F2", shiftKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { code: "F1", key: "F1", shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { code: "Enter", key: "Enter" });
    await waitFor(() => expect(api.answerAttempt).toHaveBeenCalledWith("att-100"));
    expect(await screen.findByLabelText("Фамилия и имя заявителя")).toBeEnabled();
  });

  it("в карточке: Alt+A — на адрес, Alt+T — на тип происшествия, Alt+E — подтверждение «сохранить»; работают в русской раскладке (по code)", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять" }));
    await screen.findByLabelText("Фамилия и имя заявителя");
    fireEvent.keyDown(document.body, { code: "KeyA", key: "ф", altKey: true });
    expect(document.activeElement?.closest('[aria-label="Адрес"]')).not.toBeNull();
    fireEvent.keyDown(document.body, { code: "KeyT", key: "е", altKey: true });
    expect(document.activeElement?.closest('[aria-label="Тип происшествия"]')).not.toBeNull();
    fireEvent.keyDown(document.body, { code: "KeyE", key: "у", altKey: true });
    expect(await screen.findByRole("dialog", { name: "Подтвердите оповещение служб" })).toBeInTheDocument();
  });

  it("Enter в поле ввода не принимает вызов и не перехватывается", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять" }));
    const name = await screen.findByLabelText("Фамилия и имя заявителя");
    fireEvent.keyDown(name, { code: "Enter", key: "Enter" });
    expect(api.submitAttempt).not.toHaveBeenCalled();
  });

  it("у кнопок-значков панели «Службы» есть подписи для скринридера", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять" }));
    await screen.findByLabelText("Фамилия и имя заявителя");
    for (const name of [
      "Связи",
      "Напоминание",
      "Внимание",
      "Оповещение",
      "Сообщить о проблеме",
      "Закрыть карточку",
      "Добавить службы",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
