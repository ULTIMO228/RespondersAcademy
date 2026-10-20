"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Место в полосе тренажёра (SimulatorBar), куда экран АРМ выносит свои учебные показатели. */
const SLOT_SELECTOR = "[data-simulator-bar-slot]";

/**
 * Выносит содержимое экрана в полосу тренажёра (порталом): так тренажёрные показатели (нормативы спеки 012, FR-002)
 * не попадают в окно АРМ. Без полосы на странице (просмотр преподавателем, тесты) ничего не рисует.
 */
export function SimulatorBarSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    setTarget(document.querySelector(SLOT_SELECTOR));
  }, []);
  return target ? createPortal(children, target) : null;
}
