import { describe, expect, it, vi } from "vitest";
import { createPcmPlayback } from "./playback";

function setup() {
  const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    currentTime: 1,
    destination: {},
    createBuffer: vi.fn((_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      copyToChannel: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      const node = {
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        buffer: null,
        onended: null,
      };
      nodes.push(node);
      return node;
    }),
  };
  const player = createPcmPlayback(context as unknown as AudioContext);
  const chunk = btoa(String.fromCharCode(...new Uint8Array(4800)));
  return { player, context, nodes, chunk };
}

describe("Потоковый PCM", () => {
  it("планирует чанки до завершения ответа и непрерывно проигрывает их", () => {
    const { player, nodes, chunk } = setup();
    player.begin("r1");
    player.push("r1", "item", chunk);
    player.push("r1", "item", chunk);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].start).toHaveBeenCalledWith(1.025);
    expect(nodes[1].start.mock.calls[0][0]).toBeCloseTo(1.125);
  });
  it("перебивание останавливает очередь, считает услышанный звук и отбрасывает поздние чанки", () => {
    const { player, context, nodes, chunk } = setup();
    player.begin("r1");
    player.push("r1", "item", chunk);
    context.currentTime = 1.08;
    expect(player.speechStarted()).toEqual([{ itemId: "item", milliseconds: 55 }]);
    expect(nodes[0].stop).toHaveBeenCalledOnce();
    player.speechStopped();
    player.push("r1", "item", chunk);
    expect(nodes).toHaveLength(1);
    player.done("r1");
    player.begin("r2");
    player.push("r2", "new", chunk);
    expect(nodes).toHaveLength(2);
  });
  it("не оживляет старый ответ, если перебили до response.created", () => {
    const { player, nodes, chunk } = setup();
    player.committed();
    player.speechStarted();
    player.speechStopped();
    player.begin("late");
    player.push("late", "old", chunk);
    expect(nodes).toHaveLength(0);
    player.done("late");
    player.committed();
    player.begin("next");
    player.push("next", "new", chunk);
    expect(nodes).toHaveLength(1);
  });
  it("прерывает уже сгенерированный, но ещё звучащий ответ", () => {
    const { player, nodes, chunk } = setup();
    player.begin("r1");
    player.push("r1", "item", chunk);
    player.done("r1");
    expect(player.speechStarted()[0].itemId).toBe("item");
    expect(nodes[0].stop).toHaveBeenCalledOnce();
    player.stop();
  });
});
