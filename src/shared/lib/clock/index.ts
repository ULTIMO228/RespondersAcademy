/*
 * Часы приложения за интерфейсом (spec/10-code-rules.md §6): «сейчас» и таймеры.
 * В тестах подменяются (vi.useFakeTimers() или собственная реализация Clock).
 */
export type TimerHandle = ReturnType<typeof setTimeout>;

export interface Clock {
  /** Текущее время, мс с эпохи. */
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Системные часы: Date.now + глобальные таймеры на момент вызова (совместимо с fake timers). */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};
