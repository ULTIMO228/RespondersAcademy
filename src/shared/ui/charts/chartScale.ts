/* Шкала «от нуля» для объективных диаграмм (ТЗ §17): ось Y всегда начинается с 0. */
const TICK_COUNT = 4;
const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

export type ChartBox = {
  width: number;
  height: number;
  padLeft: number;
  padBottom: number;
  padTop: number;
  padRight: number;
};

export const DEFAULT_BOX: ChartBox = {
  width: 520,
  height: 220,
  padLeft: 40,
  padBottom: 34,
  padTop: 12,
  padRight: 12,
};

export function getNiceMax(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = NICE_STEPS.find((candidate) => candidate * magnitude >= rawStep) ?? 10;
  return step * magnitude * TICK_COUNT;
}

export function getTicks(niceMax: number): number[] {
  return Array.from({ length: TICK_COUNT + 1 }, (_, index) => (niceMax / TICK_COUNT) * index);
}

export function scaleY(value: number, niceMax: number, box: ChartBox): number {
  const plotHeight = box.height - box.padTop - box.padBottom;
  return box.padTop + plotHeight - (value / niceMax) * plotHeight;
}
