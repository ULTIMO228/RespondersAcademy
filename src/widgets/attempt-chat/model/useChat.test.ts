import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { ChatMessage, ChatRequest, ChatResponse } from "@/shared/api";
import { createChatHistoryStore, createMemoryStorage } from "@/shared/lib";

import { CHAT_NOTICES, useChat } from "./useChat";

const ANSWER: ChatResponse = { reply: "Ответ", source: "local", provider: "llama", modelName: "qwen" };

function setup(
  send = vi.fn<(request: ChatRequest, signal?: AbortSignal) => Promise<ChatResponse>>(async () => ANSWER),
  seed: ChatMessage[] = [],
) {
  const store = createChatHistoryStore<ChatMessage>(createMemoryStorage());
  if (seed.length) store.save("att-1", seed);
  const hook = renderHook(() => useChat({ attemptId: "att-1", mode: "dds", send, store }));
  return { ...hook, send, store };
}

const turn = (id: string, role: "user" | "assistant", status: "sent" | "failed" = "sent"): ChatMessage => ({
  id,
  role,
  content: `текст ${id}`,
  status,
  timestamp: "2026-10-20T10:00:00Z",
});

describe("useChat", () => {
  it("open/close меняют состояние", () => {
    const { result } = setup();
    expect(result.current.status).toBe("closed");
    act(() => result.current.open());
    expect(result.current.status).toBe("open");
    act(() => result.current.close());
    expect(result.current.status).toBe("closed");
  });

  it("вопрос уходит в API, ответ попадает в ленту с источником и в хранилище", async () => {
    const { result, send, store } = setup();
    act(() => result.current.open());
    act(() => result.current.ask("  Почему так?  "));
    expect(result.current.status).toBe("waiting");
    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(send).toHaveBeenCalledWith(
      { attemptId: "att-1", mode: "dds", message: "Почему так?", history: [] },
      expect.any(AbortSignal),
    );
    const [user, assistant] = result.current.messages;
    expect(user).toMatchObject({ role: "user", content: "Почему так?", status: "sent" });
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "Ответ",
      source: "local",
      modelName: "qwen",
    });
    expect(store.load("att-1")).toHaveLength(2);
  });

  it("в запрос идут только последние 6 доставленных реплик", async () => {
    const seed = Array.from({ length: 8 }, (_, i) => turn(`m${i + 1}`, i % 2 ? "assistant" : "user"));
    const { result, send } = setup(undefined, seed);
    act(() => result.current.ask("Ещё"));
    await waitFor(() => expect(result.current.status).toBe("open"));
    const request = send.mock.calls[0][0];
    expect(request.history).toHaveLength(6);
    expect(request.history[0].content).toBe("текст m3");
    expect(request.history.at(-1)?.content).toBe("текст m8");
  });

  it("повторный вопрос во время ожидания игнорируется", async () => {
    let resolve: (value: ChatResponse) => void = () => {};
    const send = vi.fn(() => new Promise<ChatResponse>((r) => (resolve = r)));
    const { result } = setup(send);
    act(() => result.current.ask("Раз"));
    act(() => result.current.ask("Два"));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => resolve(ANSWER));
    expect(result.current.messages).toHaveLength(2);
  });

  it("сбой: реплика failed, состояние error, «Повторить» отправляет тот же вопрос и снимает ошибку", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "internal", "Сбой"))
      .mockResolvedValue(ANSWER);
    const { result } = setup(send);
    act(() => result.current.ask("Вопрос"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.messages[0].status).toBe("failed");
    expect(result.current.notice).toBe(CHAT_NOTICES.generic);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("open"));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].message).toBe("Вопрос");
    expect(send.mock.calls[1][0].history).toEqual([]);
    expect(result.current.messages.map((m) => m.status)).toEqual(["sent", "sent"]);
    expect(result.current.notice).toBeNull();
  });

  it("429 — понятное сообщение в ленте", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(429, "internal", "Лимит"));
    const { result } = setup(send);
    act(() => result.current.ask("Вопрос"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notice).toBe(CHAT_NOTICES.tooMany);
  });

  it("закрытие во время ожидания отменяет запрос; вопрос остаётся с «Повторить»", async () => {
    let signal: AbortSignal | undefined;
    const send = vi.fn(
      (_r: ChatRequest, s?: AbortSignal) =>
        new Promise<ChatResponse>((_resolve, reject) => {
          signal = s;
          s?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")));
        }),
    );
    const { result } = setup(send);
    act(() => result.current.open());
    act(() => result.current.ask("Вопрос"));
    act(() => result.current.close());
    expect(signal?.aborted).toBe(true);
    expect(result.current.status).toBe("closed");
    expect(result.current.messages[0].status).toBe("failed");
    act(() => result.current.open());
    expect(result.current.status).toBe("error");
    expect(result.current.notice).toBe(CHAT_NOTICES.interrupted);
  });

  it("размонтирование отменяет запрос", () => {
    let signal: AbortSignal | undefined;
    const send = vi.fn((_r: ChatRequest, s?: AbortSignal) => {
      signal = s;
      return new Promise<ChatResponse>(() => {});
    });
    const { result, unmount } = setup(send);
    act(() => result.current.ask("Вопрос"));
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("clear удаляет ленту и историю попытки", async () => {
    const { result, store } = setup(undefined, [turn("m1", "user"), turn("m2", "assistant")]);
    expect(result.current.messages).toHaveLength(2);
    act(() => result.current.clear());
    expect(result.current.messages).toEqual([]);
    expect(store.load("att-1")).toEqual([]);
  });

  it("лента восстанавливается из хранилища", () => {
    const { result } = setup(undefined, [turn("m1", "user")]);
    expect(result.current.messages).toHaveLength(1);
  });
});
