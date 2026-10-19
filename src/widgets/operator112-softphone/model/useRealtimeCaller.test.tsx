import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeEvent } from "@/shared/api";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  ticket: vi.fn(),
  connect: vi.fn(),
  createDuplex: vi.fn(),
}));
vi.mock("@/shared/api", () => ({ realtimeCallApi: mocks }));
vi.mock("@/shared/lib/realtime-audio", () => ({ createDuplex: mocks.createDuplex }));
import { useRealtimeCaller } from "./useRealtimeCaller";

describe("Потоковый разговор", () => {
  let receive: (event: RealtimeEvent) => void;
  const audio = {
    prepare: vi.fn(),
    transmit: vi.fn(),
    mute: vi.fn(),
    begin: vi.fn(),
    committed: vi.fn(),
    speechStarted: vi.fn(),
    speechStopped: vi.fn(),
    play: vi.fn(),
    done: vi.fn(),
    stop: vi.fn(),
  };
  const socket = { sendAudio: vi.fn(), truncate: vi.fn(), close: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    audio.prepare.mockResolvedValue(undefined);
    audio.speechStarted.mockReturnValue([{ itemId: "item", milliseconds: 123 }]);
    mocks.status.mockResolvedValue({ configured: true });
    mocks.ticket.mockResolvedValue({ url: "ws://backend", ticket: "one-use" });
    mocks.createDuplex.mockReturnValue(audio);
    mocks.connect.mockImplementation((_access, callback) => {
      receive = callback;
      return socket;
    });
  });
  it("начинает поток только после ответа на вызов и прекращает его при уходе", async () => {
    const { result, rerender, unmount } = renderHook(({ answered }) => useRealtimeCaller("att", answered), {
      initialProps: { answered: false },
    });
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => {
      expect(await result.current.prepare()).toBe(true);
    });
    expect(mocks.ticket).not.toHaveBeenCalled();
    rerender({ answered: true });
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
    act(() => receive({ type: "ready" }));
    expect(audio.transmit).toHaveBeenCalledOnce();
    act(() => receive({ type: "response.created", response: { id: "r" } }));
    act(() => receive({ type: "conversation.item.input_audio_transcription.completed", transcript: "алло" }));
    act(() => receive({ type: "response.text.delta", response_id: "r", delta: "Помогите." }));
    expect(result.current.lastHeard).toBe("алло");
    expect(result.current.lastCaller).toBe("Помогите.");
    act(() => receive({ type: "response.audio.delta", response_id: "r", item_id: "item", delta: "AAAA" }));
    expect(audio.play).toHaveBeenCalledWith("r", "item", "AAAA");
    act(() => receive({ type: "input_audio_buffer.speech_started" }));
    expect(socket.truncate).toHaveBeenCalledWith("item", 123);
    unmount();
    expect(socket.close).toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalled();
  });
  it("отказ микрофона показывает ошибку и не создаёт звонок", async () => {
    audio.prepare.mockRejectedValue(new Error("Нет микрофона"));
    const { result } = renderHook(() => useRealtimeCaller("att", true));
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => {
      expect(await result.current.prepare()).toBe(false);
    });
    expect(result.current.error).toBe("Нет микрофона");
    expect(mocks.ticket).not.toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalled();
  });
  it("не подключает модель после ухода во время разрешения микрофона", async () => {
    let resume!: () => void;
    audio.prepare.mockReturnValue(
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => useRealtimeCaller("att", true));
    await waitFor(() => expect(result.current.configured).toBe(true));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.prepare();
    });
    unmount();
    resume();
    expect(await pending).toBe(false);
    expect(mocks.ticket).not.toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalled();
  });
  it("ошибка провайдера освобождает микрофон и разрешает повтор", async () => {
    const { result } = renderHook(() => useRealtimeCaller("att", true));
    await waitFor(() => expect(result.current.configured).toBe(true));
    await act(async () => {
      await result.current.prepare();
    });
    await waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    act(() => receive({ type: "error", message: "Модель недоступна" }));
    expect(result.current.phase).toBe("error");
    expect(audio.stop).toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
  });
});
