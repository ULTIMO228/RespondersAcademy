import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { OperatorAttempt } from "@/shared/api";

import { EMERGENCY_AUDIO_NOTE, EXAM_REPLAY_NOTE, Operator112Softphone } from "./Operator112Softphone";

const OPENED = Date.parse("2026-09-29T10:00:00+03:00");
const NORMS = { answerSec: 30, submitSec: 180 };
const READY_AUDIO = {
  cardId: "c-010",
  status: "ready" as const,
  transcript: "Горит балкон",
  voice: "female",
  emergency: false,
};

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-1",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: "2026-09-29T10:00:00+03:00",
    openedAt: "2026-09-29T10:00:00+03:00",
    state: "ringing",
    events: [],
    replays: 0,
    hintsShown: 0,
    audio: READY_AUDIO,
    ...overrides,
  };
}

const answered = (overrides: Partial<OperatorAttempt> = {}) =>
  attempt({ state: "answered", answeredAt: "2026-09-29T10:00:05+03:00", ...overrides });

let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:audio-1"), revokeObjectURL: vi.fn() }),
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function view(props: Partial<Parameters<typeof Operator112Softphone>[0]> = {}) {
  return (
    <Operator112Softphone
      attempt={attempt()}
      format="training"
      norms={NORMS}
      nowMs={OPENED + 12_000}
      onAnswer={vi.fn()}
      {...props}
    />
  );
}

describe("Operator112Softphone: входящий вызов", () => {
  it("показывает АОН, отсчёт ожидания против норматива и кнопку «Ответить»", () => {
    const onAnswer = vi.fn();
    render(view({ onAnswer }));
    expect(screen.getByText("9161263471")).toBeInTheDocument();
    expect(screen.getByText("Входящий вызов")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAccessibleName(/ожидание ответа: 00:12/);
    expect(screen.getByText("Норматив ответа — 30 с")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ответить на вызов" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("после норматива таймер краснеет, кнопка остаётся доступной", () => {
    render(view({ nowMs: OPENED + 41_000 }));
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "true");
    expect(screen.getByText("Норматив ответа 30 с превышен")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ответить на вызов" })).toBeEnabled();
  });

  it("во время запроса «Ответить» блокируется от повторного нажатия", () => {
    render(view({ isAnswering: true }));
    expect(screen.getByRole("button", { name: "Соединение…" })).toBeDisabled();
  });
});

describe("Operator112Softphone: разговор и запись", () => {
  it("после ответа идёт таймер разговора, запись запрашивается один раз и воспроизводится", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(view({ attempt: answered(), nowMs: OPENED + 65_000, audioLoader }));
    expect(screen.getByRole("timer")).toHaveAccessibleName(/разговор: 01:00/);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(container.querySelector("audio")).toHaveAttribute("src", "blob:audio-1");
    expect(audioLoader).toHaveBeenCalledTimes(1);
    expect(audioLoader).toHaveBeenCalledWith("c-010");
    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it("StrictMode не делает второй запрос файла (в экзамене он был бы засчитан как повтор)", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(<StrictMode>{view({ attempt: answered(), audioLoader })}</StrictMode>);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(audioLoader).toHaveBeenCalledTimes(1);
  });

  it("404 файла → транскрипт с пометкой аварийного режима, ввод не блокируется", async () => {
    const audioLoader = vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Аудиозапись не готова"));
    render(view({ attempt: answered(), audioLoader }));
    expect(await screen.findByText(EMERGENCY_AUDIO_NOTE)).toBeInTheDocument();
    expect(screen.getByText("Горит балкон")).toBeInTheDocument();
  });

  it("emergency в попытке → файл не запрашивается, сразу транскрипт", async () => {
    const audioLoader = vi.fn();
    const emergency = answered({ audio: { ...READY_AUDIO, emergency: true, status: "failed" } });
    render(view({ attempt: emergency, audioLoader }));
    expect(await screen.findByText(EMERGENCY_AUDIO_NOTE)).toBeInTheDocument();
    expect(audioLoader).not.toHaveBeenCalled();
  });

  it("экзамен: 409 на файл → «Повторное прослушивание в экзамене запрещено», транскрипта нет", async () => {
    const audioLoader = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "conflict", "В экзамене запись прослушивается один раз"));
    render(view({ attempt: answered(), format: "exam", audioLoader }));
    expect(await screen.findByRole("alert")).toHaveTextContent(EXAM_REPLAY_NOTE);
    expect(screen.queryByText("Горит балкон")).toBeNull();
  });

  it("экзамен после перезагрузки (replays ≥ 1): запрос не отправляется, повтор запрещён", async () => {
    const audioLoader = vi.fn();
    render(view({ attempt: answered({ replays: 1 }), format: "exam", audioLoader }));
    expect(await screen.findByRole("alert")).toHaveTextContent(EXAM_REPLAY_NOTE);
    expect(audioLoader).not.toHaveBeenCalled();
  });

  it("экзамен: плеер без нативных контролов и без кнопки повтора", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(
      view({ attempt: answered(), format: "exam", audioLoader, onReplay: vi.fn() }),
    );
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(container.querySelector("audio")).not.toHaveAttribute("controls");
    expect(screen.queryByRole("button", { name: "Прослушать ещё раз" })).toBeNull();
    expect(screen.getByText(EXAM_REPLAY_NOTE)).toBeInTheDocument();
  });

  it("тренировка: «Прослушать ещё раз» фиксирует событие и перезапускает воспроизведение", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const onReplay = vi.fn();
    const { container } = render(view({ attempt: answered(), audioLoader, onReplay }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    play.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Прослушать ещё раз" }));
    });
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")).toHaveAttribute("controls");
  });

  it("автовоспроизведение заблокировано браузером → кнопка «Воспроизвести запись»", async () => {
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    render(view({ attempt: answered(), audioLoader }));
    expect(await screen.findByRole("button", { name: "Воспроизвести запись" })).toBeInTheDocument();
  });

  it("ответ позже норматива, отмеченный сервером, помечается на софтфоне", () => {
    const late = answered({ events: [{ id: "ev-001", type: "answerTimeout", at: "t", payload: {} }] });
    render(view({ attempt: late, audioLoader: vi.fn().mockResolvedValue(new Blob([])) }));
    expect(screen.getByTestId("answer-timeout")).toHaveTextContent("Ответ позже норматива 30 с");
  });
});
