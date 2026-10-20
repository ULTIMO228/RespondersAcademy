import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatClock } from "@/entities/operator112-attempt";
import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import { CardTimer } from "./CardTimer";

/** Порог красного (спека 009, R7); боевая константа живёт в entities, здесь независимая копия для проверки. */
const CARD_TIMER_RED_SEC = 60;

/** Тестовая обвязка: часы тикают раз в секунду независимо от модального окна поверх. */
function Harness({ clock }: { clock: Clock }) {
  const [sec, setSec] = useState(0);
  const [isModal] = useState(true);
  useEffect(() => {
    const handle = clock.setTimeout(() => setSec((value) => value + 1), 1000);
    return () => clock.clearTimeout(handle);
  }, [clock, sec]);
  return (
    <>
      <CardTimer text={formatClock(sec)} isRed={sec > CARD_TIMER_RED_SEC} />
      {isModal ? <div role="dialog" aria-modal="true" aria-label="Добавьте службы" /> : null}
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CardTimer под модальным окном (КАРТОЧКА_3)", () => {
  it("таймер продолжает тикать, пока открыто окно «Добавьте службы», и краснеет по порогу", () => {
    render(<Harness clock={systemClock} />);
    expect(screen.getByRole("dialog", { name: "Добавьте службы" })).toBeInTheDocument();
    const tick = (seconds: number) => {
      for (let i = 0; i < seconds; i += 1) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
    };
    tick(5);
    expect(screen.getByRole("timer")).toHaveTextContent("00:05");
    expect(screen.getByRole("timer").className).not.toMatch(/timer--red/);
    tick(CARD_TIMER_RED_SEC + 1 - 5);
    expect(screen.getByRole("timer").className).toMatch(/timer--red/);
  });
});
