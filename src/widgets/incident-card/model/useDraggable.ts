"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type WindowPosition = { x: number; y: number };

type Size = { width: number; height: number };

/** Позиция окна в пределах вьюпорта (окно не уходит за край экрана). */
export function clampToViewport(position: WindowPosition, size: Size, viewport: Size): WindowPosition {
  return {
    x: Math.min(Math.max(0, position.x), Math.max(0, viewport.width - size.width)),
    y: Math.min(Math.max(0, position.y), Math.max(0, viewport.height - size.height)),
  };
}

function readViewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Перетаскивание окна за заголовок (pointer events); координаты ограничены вьюпортом. */
export function useDraggable(initial: WindowPosition) {
  const [position, setPosition] = useState(initial);
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const handleMove = useCallback((event: PointerEvent) => {
    const element = windowRef.current;
    if (!drag.current || !element) return;
    const next = { x: event.clientX - drag.current.offsetX, y: event.clientY - drag.current.offsetY };
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    setPosition(clampToViewport(next, size, readViewport()));
  }, []);

  const handleUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
  }, [handleMove]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      drag.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [position, handleMove, handleUp],
  );

  useEffect(() => handleUp, [handleUp]);

  return { position, windowRef, onPointerDown };
}
