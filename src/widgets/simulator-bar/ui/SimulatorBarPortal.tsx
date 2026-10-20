"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { SIMULATOR_BAR_SLOT_ID } from "../config";

/**
 * Учебные показатели экрана (норматив, лимит, подсказка) — в полосе тренажёра, а не на экране АРМ (спека 009, FR-002).
 * Вне лэйаута симулятора (тесты, просмотр без полосы) содержимое рендерится на месте.
 */
export function SimulatorBarPortal({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [isResolved, setResolved] = useState(false);
  useEffect(() => {
    setSlot(document.getElementById(SIMULATOR_BAR_SLOT_ID));
    setResolved(true);
  }, []);
  if (!isResolved) return null;
  return slot ? createPortal(children, slot) : <>{children}</>;
}
