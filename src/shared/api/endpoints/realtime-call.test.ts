import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realtimeCallApi } from "./realtime-call";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    instances.push(this);
  }
}
let instances: Socket[] = [];
beforeEach(() => {
  instances = [];
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WebSocket голоса", () => {
  it("передаёт билет первым сообщением и звук только после ready", () => {
    const events = vi.fn();
    const connection = realtimeCallApi.connect(
      { url: "ws://backend/realtime", ticket: "secret" },
      events,
      vi.fn(),
    );
    const socket = instances[0];
    connection.sendAudio("AAAA");
    expect(socket.send).not.toHaveBeenCalled();
    socket.readyState = 1;
    socket.onopen?.();
    expect(socket.url).not.toContain("secret");
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ ticket: "secret" });
    socket.onmessage?.({ data: '{"type":"ready"}' });
    connection.sendAudio("AAAA");
    expect(JSON.parse(socket.send.mock.calls[1][0])).toEqual({
      type: "input_audio_buffer.append",
      audio: "AAAA",
    });
    connection.close();
    expect(socket.close).toHaveBeenCalled();
  });
  it("освобождает соединение даже до открытия", () => {
    const connection = realtimeCallApi.connect({ url: "ws://backend", ticket: "ticket" }, vi.fn(), vi.fn());
    connection.close();
    expect(instances[0].close).toHaveBeenCalledOnce();
    instances[0].onopen?.();
    expect(instances[0].send).not.toHaveBeenCalled();
  });
  it("при переполнении сети прекращает отправку вместо накопления задержки", () => {
    const events = vi.fn();
    const connection = realtimeCallApi.connect({ url: "ws://backend", ticket: "ticket" }, events, vi.fn());
    const socket = instances[0];
    socket.readyState = 1;
    socket.onmessage?.({ data: '{"type":"ready"}' });
    socket.bufferedAmount = 200000;
    connection.sendAudio("AAAA");
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ type: "error" }));
    connection.close();
  });
  it("таймаут ожидания модели не оставляет бесконечное соединение", () => {
    vi.useFakeTimers();
    const events = vi.fn();
    const connection = realtimeCallApi.connect({ url: "ws://backend", ticket: "ticket" }, events, vi.fn());
    vi.advanceTimersByTime(45000);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
    expect(instances[0].close).toHaveBeenCalled();
    connection.close();
  });
});
