import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { ReportAudioResponse } from "@/shared/api";
import { RecorderError } from "@/shared/lib";
import type { AudioRecorder } from "@/shared/lib";

import { ReportRecorder } from "./ReportRecorder";

const WAV = new Blob(["RIFF"], { type: "audio/wav" });

function fakeRecorder(overrides: Partial<AudioRecorder> = {}): AudioRecorder {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(WAV),
    cancel: vi.fn(),
    ...overrides,
  };
}

const RESPONSE: ReportAudioResponse = {
  attemptId: "att-1",
  call: {
    id: "call-1",
    fromUserId: "u-005",
    toNumber: "112",
    startedAt: "t",
    endedAt: "t",
    transcript: [{ speaker: "dispatcher", text: "Карточка 881412, адрес улица Грина, пожар", at: "t" }],
    report: {
      version: "1",
      text: "…",
      score: 0.6,
      missing: ["Пострадавшие", "Решение"],
      checks: [
        { id: "card", label: "Номер карточки", expected: "881412", found: true },
        { id: "address", label: "Адрес", expected: "Грина", found: true },
        { id: "type", label: "Тип происшествия", expected: "пожар", found: true },
        { id: "victims", label: "Пострадавшие", expected: "нет", found: false },
        { id: "decision", label: "Решение", expected: "101", found: false },
      ],
    },
  },
  recording: { id: "call-1", url: "/x" },
};

async function record(recorder: AudioRecorder) {
  fireEvent.click(screen.getByRole("button", { name: "Начать запись" }));
  fireEvent.click(await screen.findByRole("button", { name: "Остановить" }));
  expect(recorder.stop).toBeDefined();
}

describe("ReportRecorder", () => {
  it("запись → отправка → транскрипт и чек-лист «3 из 5»", async () => {
    const recorder = fakeRecorder();
    const send = vi.fn().mockResolvedValue(RESPONSE);
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={send} />);
    await record(recorder);
    fireEvent.click(await screen.findByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Чек-лист: 3 из 5")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith("att-1", WAV);
    expect(screen.getByText(/Карточка 881412/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Чек-лист доклада" }).querySelectorAll("li")).toHaveLength(5);
  });

  it("503 → «Распознавание речи недоступно», запись остаётся для повтора", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "internal", "Локальная модель Vosk small-ru не найдена"))
      .mockResolvedValue(RESPONSE);
    const recorder = fakeRecorder();
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={send} />);
    await record(recorder);
    fireEvent.click(await screen.findByRole("button", { name: "Отправить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Распознавание речи недоступно");
    fireEvent.click(screen.getByRole("button", { name: "Повторить отправку" }));
    expect(await screen.findByText("Чек-лист: 3 из 5")).toBeInTheDocument();
  });

  it("400 «речь не распознана» показывается дословно", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError(400, "validationFailed", "Речь в аудиодокладе не распознана"));
    const recorder = fakeRecorder();
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={send} />);
    await record(recorder);
    fireEvent.click(await screen.findByRole("button", { name: "Отправить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Речь в аудиодокладе не распознана");
  });

  it("отказ микрофона: сообщение, карточка не затронута, можно начать снова", async () => {
    const recorder = fakeRecorder({
      start: vi.fn().mockRejectedValue(new RecorderError("denied", "Доступ к микрофону запрещён")),
    });
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Начать запись" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Доступ к микрофону запрещён");
    expect(screen.getByRole("button", { name: "Начать запись" })).toBeEnabled();
  });

  it("параллельная повторная отправка блокируется: один запрос", async () => {
    let release: (value: ReportAudioResponse) => void = () => undefined;
    const send = vi.fn().mockReturnValue(new Promise<ReportAudioResponse>((resolve) => (release = resolve)));
    const recorder = fakeRecorder();
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={send} />);
    await record(recorder);
    const submit = await screen.findByRole("button", { name: "Отправить" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Распознаём…")).toBeInTheDocument();
    release(RESPONSE);
    await waitFor(() => expect(screen.getByText("Чек-лист: 3 из 5")).toBeInTheDocument());
  });

  it("речь распознана без чек-листа (нет report) — пояснение; «Записать заново» освобождает микрофон", async () => {
    const send = vi.fn().mockResolvedValue({ ...RESPONSE, call: { ...RESPONSE.call, report: undefined } });
    const recorder = fakeRecorder();
    render(<ReportRecorder attemptId="att-1" createRecorder={() => recorder} send={send} />);
    await record(recorder);
    fireEvent.click(await screen.findByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Речь распознана, чек-лист не составлен")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Записать ещё" }));
    expect(recorder.start).toHaveBeenCalledTimes(2);
  });
});
