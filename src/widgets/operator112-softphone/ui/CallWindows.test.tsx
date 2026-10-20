import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { OperatorAttempt } from "@/shared/api";

import { CallRecordingWindow, EMERGENCY_AUDIO_NOTE, EXAM_REPLAY_NOTE } from "./CallRecordingWindow";
import { IncomingCallWindow } from "./IncomingCallWindow";

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

function view(props: Partial<Parameters<typeof CallRecordingWindow>[0]> = {}) {
  return (
    <CallRecordingWindow
      attempt={answered()}
      format="training"
      isOpen={false}
      onClose={vi.fn()}
      {...props}
    />
  );
}

describe("IncomingCallWindow: окно «Входящий звонок» (ИНСТРУКЦИЯ_4)", () => {
  it("номер в формате АРМ, «Принять» принимает вызов, «×» закрывает окно без приёма", () => {
    const onAnswer = vi.fn();
    const onClose = vi.fn();
    render(<IncomingCallWindow aon={attempt().aon} onAnswer={onAnswer} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
    expect(screen.getByText("с номера +7 (916) 126-34-71")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть окно вызова" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("во время запроса «Принять» блокируется от повторного нажатия", () => {
    render(<IncomingCallWindow aon="9161263471" isAnswering onAnswer={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Соединение…" })).toBeDisabled();
  });
});

describe("CallRecordingWindow: запись разговора", () => {
  it("до ответа запись не запрашивается", () => {
    const audioLoader = vi.fn();
    render(view({ attempt: attempt(), audioLoader }));
    expect(audioLoader).not.toHaveBeenCalled();
  });

  it("после ответа запись запрашивается один раз и играет при закрытом окне", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(view({ audioLoader }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(container.querySelector("audio")).toHaveAttribute("src", "blob:audio-1");
    expect(screen.getByLabelText("Записи звонков", { selector: "section" })).not.toBeVisible();
    expect(audioLoader).toHaveBeenCalledTimes(1);
    expect(audioLoader).toHaveBeenCalledWith("c-010");
    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it("StrictMode не делает второй запрос файла (в экзамене он был бы засчитан как повтор)", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(<StrictMode>{view({ audioLoader })}</StrictMode>);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(audioLoader).toHaveBeenCalledTimes(1);
  });

  it("StrictMode: blob-URL, стоящий в плеере, не отозван (иначе play() → NotSupportedError)", async () => {
    let counter = 0;
    const created: string[] = [];
    const revoked: string[] = [];
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      const url = `blob:audio-${++counter}`;
      created.push(url);
      return url;
    });
    vi.mocked(URL.revokeObjectURL).mockImplementation((url) => void revoked.push(url));
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const { container } = render(<StrictMode>{view({ audioLoader })}</StrictMode>);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    const src = container.querySelector("audio")?.getAttribute("src") ?? "";
    expect(created).toContain(src);
    expect(revoked).not.toContain(src);
  });

  it("404 файла → окно открывается само: транскрипт с пометкой аварийного режима", async () => {
    const audioLoader = vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Аудиозапись не готова"));
    render(view({ audioLoader }));
    expect(await screen.findByText(EMERGENCY_AUDIO_NOTE)).toBeVisible();
    expect(screen.getByText("Горит балкон")).toBeInTheDocument();
  });

  it("emergency в попытке → файл не запрашивается, сразу транскрипт; «×» закрывает окно", async () => {
    const audioLoader = vi.fn();
    const onClose = vi.fn();
    const emergency = answered({ audio: { ...READY_AUDIO, emergency: true, status: "failed" } });
    render(view({ attempt: emergency, audioLoader, onClose }));
    expect(await screen.findByText(EMERGENCY_AUDIO_NOTE)).toBeVisible();
    expect(audioLoader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть записи" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText(EMERGENCY_AUDIO_NOTE)).not.toBeVisible();
  });

  it("экзамен: 409 на файл → «Повторное прослушивание в экзамене запрещено», транскрипта нет", async () => {
    const audioLoader = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "conflict", "В экзамене запись прослушивается один раз"));
    render(view({ format: "exam", audioLoader }));
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
    const { container } = render(view({ format: "exam", audioLoader, onReplay: vi.fn(), isOpen: true }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(container.querySelector("audio")).not.toHaveAttribute("controls");
    expect(screen.queryByRole("button", { name: "Прослушать ещё раз" })).toBeNull();
    expect(screen.getByText(EXAM_REPLAY_NOTE)).toBeInTheDocument();
  });

  it("тренировка: «Прослушать ещё раз» фиксирует событие и перезапускает воспроизведение", async () => {
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    const onReplay = vi.fn();
    const { container } = render(view({ audioLoader, onReplay, isOpen: true }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    play.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Прослушать ещё раз" }));
    });
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")).toHaveAttribute("controls");
  });

  it("автовоспроизведение заблокировано браузером → окно открывается с «Воспроизвести запись»", async () => {
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    const audioLoader = vi.fn().mockResolvedValue(new Blob(["RIFF"]));
    render(view({ audioLoader }));
    expect(await screen.findByRole("button", { name: "Воспроизвести запись" })).toBeVisible();
  });
});
