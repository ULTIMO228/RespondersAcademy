import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { liveCallApi } from "@/shared/api";

import { LiveCaller } from "./LiveCaller";

function setup() {
  const capture = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), setEnabled: vi.fn() };
  const deps = { api: liveCallApi, capture: vi.fn(() => capture) };
  const onAnswer = vi.fn();
  const view = (
    <LiveCaller
      attempt={{
        id: "att-1",
        cardId: "c-010",
        studentId: "u-005",
        aon: "9161263471",
        incidentNumber: 4,
        createdAt: "2026-10-19T10:00:00Z",
        openedAt: "2026-10-19T10:00:00Z",
        state: "ringing",
        events: [],
        replays: 0,
        hintsShown: 0,
      }}
      format="training"
      norms={{ answerSec: 30, submitSec: 180 }}
      nowMs={Date.parse("2026-10-19T10:00:10Z")}
      onAnswer={onAnswer}
      deps={deps}
    />
  );
  return { capture, onAnswer, view };
}

describe("LiveCaller: один захват микрофона при ответе", () => {
  it("при отказе сохраняет входящий вызов и показывает ошибку", async () => {
    const test = setup();
    test.capture.start.mockRejectedValueOnce(new Error("Разрешите микрофон"));
    render(test.view);
    fireEvent.click(screen.getByRole("button", { name: "Ответить на вызов" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Разрешите микрофон");
    expect(test.onAnswer).not.toHaveBeenCalled();
  });
  it("не отвечает на старый вызов после ухода во время разрешения", async () => {
    const test = setup();
    let resolve!: () => void;
    test.capture.start.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const { unmount } = render(test.view);
    fireEvent.click(screen.getByRole("button", { name: "Ответить на вызов" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Соединение…" })).toBeDisabled());
    unmount();
    await act(async () => resolve());
    expect(test.onAnswer).not.toHaveBeenCalled();
    expect(test.capture.stop).toHaveBeenCalled();
  });
  it("одна кнопка ответа подключает микрофон и принимает вызов", async () => {
    const test = setup();
    render(test.view);
    fireEvent.click(screen.getByRole("button", { name: "Ответить на вызов" }));
    await waitFor(() => expect(test.onAnswer).toHaveBeenCalledTimes(1));
    expect(test.capture.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Отправить реплику" })).not.toBeInTheDocument();
  });
});
