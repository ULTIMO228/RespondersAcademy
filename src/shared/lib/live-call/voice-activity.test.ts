import { describe, expect, it, vi } from "vitest";

import { createVoiceActivity } from "./voice-activity";

function setup() {
  const onStart = vi.fn();
  const onEnd = vi.fn();
  const onUtterance = vi.fn();
  const vad = createVoiceActivity({ sampleRate: 16000, onStart, onEnd, onUtterance });
  const feed = (ms: number, level = 0) => {
    for (let i = 0; i < ms / 20; i++) vad.push(new Float32Array(320).fill(level));
  };
  return { vad, feed, onStart, onEnd, onUtterance };
}

describe("непрерывная речь", () => {
  it("тишина и одиночный щелчок не отправляются", () => {
    const test = setup();
    test.feed(10000);
    test.feed(20, 0.2);
    test.feed(2000);
    expect(test.onStart).not.toHaveBeenCalled();
    expect(test.onUtterance).not.toHaveBeenCalled();
  });
  it("сохраняет начало фразы и отправляет один WAV после секунды паузы", () => {
    const test = setup();
    test.feed(500);
    test.feed(500, 0.1);
    test.feed(800);
    expect(test.onStart).toHaveBeenCalledTimes(1);
    expect(test.onUtterance).not.toHaveBeenCalled();
    test.feed(200);
    expect(test.onUtterance).toHaveBeenCalledTimes(1);
    const samples = test.onUtterance.mock.calls[0][0] as Float32Array;
    expect(Array.from(samples).filter((value) => value > 0.05)).toHaveLength(8000);
    test.feed(2000);
    expect(test.onUtterance).toHaveBeenCalledTimes(1);
  });
  it("короткая пауза внутри вопроса не дробит реплику", () => {
    const test = setup();
    test.feed(400, 0.1);
    test.feed(400);
    test.feed(400, 0.1);
    test.feed(1000);
    expect(test.onUtterance).toHaveBeenCalledTimes(1);
  });
  it("mute сбрасывает незавершённую фразу, следующая начинается заново", () => {
    const test = setup();
    test.feed(400, 0.1);
    test.vad.reset();
    test.feed(1000);
    expect(test.onUtterance).not.toHaveBeenCalled();
    test.feed(400, 0.1);
    test.feed(1000);
    expect(test.onUtterance).toHaveBeenCalledTimes(1);
  });
  it("ограничивает одну непрерывную реплику двадцатью секундами", () => {
    const test = setup();
    test.feed(20500, 0.1);
    expect(test.onUtterance).toHaveBeenCalledTimes(1);
    expect(test.onUtterance.mock.calls[0][0].length).toBeLessThanOrEqual(320000);
  });
});
