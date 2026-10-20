import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reference } from "@/shared/api";
import type { CardEventContract, DdsStatusDef } from "@/shared/api";
import type { Clock } from "@/shared/lib";

import type { OutboxItem } from "../lib/outbox";
import { useCardStatuses } from "./useCardStatuses";

const ATTEMPT = {
  id: "a-1",
  cardId: "c-1",
  studentId: "u-010",
  openedAt: "2026-10-20T10:00:00+03:00",
  statuses: [],
} as unknown as CardEventContract;

const clock = {
  now: () => new Date("2026-10-20T10:01:00+03:00"),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
} as unknown as Clock;
const values = (status: string) => ({ status, comment: "Работы завершены, всё в порядке", dutyNumber: "" });

describe("useCardStatuses: завершение попытки", () => {
  it("карточка считается завершённой только после того, как сервер принял завершение (нет гонки с оценкой)", async () => {
    let releaseProgress: () => void = () => undefined;
    const dispatch = vi.fn((item: OutboxItem) =>
      item.kind === "progress"
        ? new Promise<null>((resolve) => {
            releaseProgress = () => resolve(null);
          })
        : Promise.resolve(null),
    );
    const { result } = renderHook(() =>
      useCardStatuses({
        cardId: "c-1",
        attempt: ATTEMPT,
        serverStatus: "workInProgress",
        ddsStatuses: reference.ddsStatuses as DdsStatusDef[],
        dispatch,
        clock,
      }),
    );
    let submitting: Promise<void> = Promise.resolve();
    await act(async () => {
      submitting = result.current.submit(values("workDone"));
      await Promise.resolve();
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "progress" }));
    // Пока завершение не дошло до сервера, оценку запрашивать рано.
    expect(result.current.isCompleted).toBe(false);
    await act(async () => {
      releaseProgress();
      await submitting;
    });
    expect(result.current.isCompleted).toBe(true);
    const progress = dispatch.mock.calls[1][0].request as { completedAt: string };
    expect(result.current.completedAt).toBe(progress.completedAt);
  });

  it("промежуточный статус попытку не завершает", async () => {
    const dispatch = vi.fn(() => Promise.resolve(null));
    const { result } = renderHook(() =>
      useCardStatuses({
        cardId: "c-1",
        attempt: ATTEMPT,
        serverStatus: "accepted",
        ddsStatuses: reference.ddsStatuses as DdsStatusDef[],
        dispatch,
        clock,
      }),
    );
    await act(async () => {
      await result.current.submit(values("responseStarted"));
    });
    expect(result.current.isCompleted).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
