import type { Clock } from "@/shared/lib";

export const TICK_MS = 1000;

/**
 * Секундный тикер экрана режима 112: вызывает onTick каждые TICK_MS по подменяемым часам (Clock), возвращает остановку.
 * Через setTimeout, а не setInterval, чтобы тесты на fake timers управляли ходом времени тем же Clock.
 */
export function createTicker(
  clock: Clock,
  onTick: (nowMs: number) => void,
  intervalMs = TICK_MS,
): () => void {
  let stopped = false;
  let handle: ReturnType<Clock["setTimeout"]> | undefined;
  const schedule = () => {
    handle = clock.setTimeout(() => {
      if (stopped) return;
      onTick(clock.now());
      schedule();
    }, intervalMs);
  };
  schedule();
  return () => {
    stopped = true;
    if (handle !== undefined) clock.clearTimeout(handle);
  };
}
