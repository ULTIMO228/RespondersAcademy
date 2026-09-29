import { describe, expect, it } from "vitest";

import { MAX_RECORDING_SEC, TARGET_SAMPLE_RATE, encodeWav, mixToMono, resample, toReportWav } from "./wav";

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}
const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)));

describe("WAV для доклада", () => {
  it("заголовок: RIFF/WAVE, PCM, моно, 16 бит, частота и длина данных", async () => {
    const view = await bytes(encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16_000));
    expect(text(view, 0, 4)).toBe("RIFF");
    expect(text(view, 8, 4)).toBe("WAVE");
    expect(text(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.byteLength).toBe(44 + 8);
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8);
  });

  it("отсчёты: 0, ±0.5, крайние значения и выход за диапазон ограничиваются", async () => {
    const view = await bytes(encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]), 16_000));
    const sample = (index: number) => view.getInt16(44 + index * 2, true);
    expect([sample(0), sample(3), sample(4), sample(5), sample(6)]).toEqual([
      0, 32767, -32768, 32767, -32768,
    ]);
    expect(sample(1)).toBe(Math.trunc(0.5 * 0x7fff));
  });

  it("стерео → моно (среднее), моно не копируется", () => {
    expect(Array.from(mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
    const one = new Float32Array([0.1]);
    expect(mixToMono([one])).toBe(one);
    expect(mixToMono([]).length).toBe(0);
  });

  it("передискретизация 48 → 16 кГц: длина в три раза меньше, значения интерполируются", () => {
    const source = Float32Array.from({ length: 480 }, (_, index) => index / 480);
    const out = resample(source, 48_000, 16_000);
    expect(out.length).toBe(160);
    expect(out[0]).toBe(0);
    expect(out[80]).toBeCloseTo(0.5, 2);
    expect(resample(source, 16_000, 16_000)).toBe(source);
  });

  it("toReportWav: любая исходная частота даёт 16 кГц; лимит записи — 180 с (≈ 5,5 МБ, в пределах 20 МБ)", async () => {
    const view = await bytes(toReportWav([new Float32Array(44_100), new Float32Array(44_100)], 44_100));
    expect(view.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE);
    expect(view.getUint32(40, true)).toBe(TARGET_SAMPLE_RATE * 2);
    expect(MAX_RECORDING_SEC).toBe(180);
    expect(MAX_RECORDING_SEC * TARGET_SAMPLE_RATE * 2 + 44).toBeLessThan(20 * 1024 * 1024);
  });
});
