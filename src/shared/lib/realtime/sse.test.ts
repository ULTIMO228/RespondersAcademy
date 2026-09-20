/* T3.3-02: SSE-ветка подписки — кадр потока принимается, любая ошибка уводит на long-poll. */
import { describe, expect, it, vi } from "vitest";

import { openEventStream } from "./sse";
import type { EventStream } from "./transport";

type Listener = (event: { data?: string }) => void;

function createFakeStream() {
  const listeners = new Map<string, Listener>();
  let isClosed = false;
  const stream: EventStream = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    close: () => {
      isClosed = true;
    },
  };
  return {
    stream,
    emit: (type: "message" | "error", data?: string) => listeners.get(type)?.({ data }),
    isClosed: () => isClosed,
  };
}

describe("openEventStream", () => {
  it("кадр потока превращается в страницу ленты", () => {
    const fake = createFakeStream();
    const onPage = vi.fn();
    const onFailure = vi.fn();
    openEventStream<string>({
      url: "/feed",
      createEventStream: () => fake.stream,
      onPage,
      onFailure,
    });
    fake.emit("message", JSON.stringify({ at: "t1", events: ["e1"] }));
    expect(onPage).toHaveBeenCalledWith({ at: "t1", events: ["e1"] });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("ошибка потока и мусорный кадр закрывают поток и уводят на long-poll", () => {
    const broken = createFakeStream();
    const onFailure = vi.fn();
    openEventStream<string>({
      url: "/feed",
      createEventStream: () => broken.stream,
      onPage: vi.fn(),
      onFailure,
    });
    broken.emit("message", "не json");
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(broken.isClosed()).toBe(true);
    broken.emit("error");
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  it("EventSource недоступен (фабрика бросает) → сразу long-poll", () => {
    const onFailure = vi.fn();
    openEventStream<string>({
      url: "/feed",
      createEventStream: () => {
        throw new Error("EventSource is not defined");
      },
      onPage: vi.fn(),
      onFailure,
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
