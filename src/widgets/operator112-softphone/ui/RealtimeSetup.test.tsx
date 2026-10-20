import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type * as Config from "@/shared/config";

import { Operator112Softphone } from "./Operator112Softphone";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, realtimeCallApi: { status: vi.fn().mockResolvedValue({ configured: false }) } };
});

vi.mock("@/shared/config", async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, APP_ENV: { ...actual.APP_ENV, liveCallsEnabled: true } };
});

describe("realtime: отсутствие подключения", () => {
  it("не подменяет живой разговор записью и не разрешает фиктивно принять вызов", async () => {
    const onAnswer = vi.fn();
    const loader = vi.fn();
    const { container } = render(
      <Operator112Softphone
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
        nowMs={Date.now()}
        onAnswer={onAnswer}
        audioLoader={loader}
      />,
    );
    expect(await screen.findByText(/Голосовой сервер ещё не подключён/)).toBeInTheDocument();
    expect(container.querySelector("audio")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ответить/ })).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
