import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { WorkMessage } from "@/shared/api";

import { formatWorkMessage } from "../model/messageText";
import type { FetchWorkMessages } from "../model/useWorkMessages";
import { WorkMessageFeed } from "./WorkMessageFeed";

const msg = (id: string, kind: WorkMessage["kind"], at: string): WorkMessage => ({
  id,
  kind,
  at,
  expectedStatus: "responseStarted",
});
const M1 = msg("wm-1", "departed", "2026-09-29T10:00:05+03:00");
const M2 = msg("wm-2", "arrived", "2026-09-29T10:00:15+03:00");

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("WorkMessageFeed", () => {
  it("текст по kind и время из серверной метки", () => {
    expect(formatWorkMessage(M1)).toBe("10:00:05 · Расчёт выехал к месту вызова");
    expect(formatWorkMessage(msg("x", "done", "2026-09-29T10:02:30+03:00"))).toBe(
      "10:02:30 · Работы завершены",
    );
  });

  it("пустая лента (сообщения не включены) — блока нет", async () => {
    const fetchMessages = vi.fn<FetchWorkMessages>().mockResolvedValue([]);
    const { container } = render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(10_000);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMessages).toHaveBeenCalled();
  });

  it("сообщения появляются по мере наступления; курсор — at последнего; дубли по id не показываются", async () => {
    const fetchMessages = vi
      .fn<FetchWorkMessages>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([M1])
      .mockResolvedValueOnce([M1, M2])
      .mockResolvedValue([]);
    render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(100);
    expect(screen.queryByRole("region")).toBeNull();
    await tick(3100);
    expect(screen.getByText("10:00:05 · Расчёт выехал к месту вызова")).toBeInTheDocument();
    await tick(3100);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("10:00:15 · Расчёт прибыл на место")).toBeInTheDocument();
    expect(fetchMessages.mock.calls[0][1]).toBeUndefined();
    expect(fetchMessages.mock.calls[2][1]).toBe(M1.at);
    await tick(3100);
    expect(fetchMessages.mock.calls[3][1]).toBe(M2.at);
  });

  it("enabled=false — запросов нет; размонтирование останавливает опрос", async () => {
    const fetchMessages = vi.fn<FetchWorkMessages>().mockResolvedValue([]);
    const off = render(<WorkMessageFeed attemptId="att-1" enabled={false} fetchMessages={fetchMessages} />);
    await tick(10_000);
    expect(fetchMessages).not.toHaveBeenCalled();
    off.unmount();
    const on = render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(100);
    const calls = fetchMessages.mock.calls.length;
    on.unmount();
    await tick(10_000);
    expect(fetchMessages.mock.calls.length).toBe(calls);
  });

  it("сбой сети: показанное сохраняется с пометкой, после восстановления лента продолжается", async () => {
    const fetchMessages = vi
      .fn<FetchWorkMessages>()
      .mockResolvedValueOnce([M1])
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([M2]);
    render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(100);
    await tick(3100);
    expect(screen.getByText("10:00:05 · Расчёт выехал к месту вызова")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Связь потеряна");
    await tick(30_000);
    expect(screen.getByText("10:00:15 · Расчёт прибыл на место")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("скрытая вкладка останавливает опрос, возврат — возобновляет без дублей", async () => {
    const fetchMessages = vi.fn<FetchWorkMessages>().mockResolvedValue([M1]);
    render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(100);
    const calls = fetchMessages.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await tick(10_000);
    expect(fetchMessages.mock.calls.length).toBe(calls);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await tick(100);
    expect(fetchMessages.mock.calls.length).toBeGreaterThan(calls);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("404 (нет бэкенда или попытка не ДДС) терминален: опрос не повторяется, блока и ошибок нет", async () => {
    const fetchMessages = vi.fn<FetchWorkMessages>().mockRejectedValue(new ApiError(404, "notFound", "нет"));
    const { container } = render(<WorkMessageFeed attemptId="att-1" fetchMessages={fetchMessages} />);
    await tick(20_000);
    expect(fetchMessages).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});
