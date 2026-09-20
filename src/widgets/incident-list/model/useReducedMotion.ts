"use client";

import { useEffect, useState } from "react";

import { useJournalDeps } from "./deps";

/**
 * prefers-reduced-motion для новых строк ленты: мигание заменяется статичным маркером. Читается после
 * монтирования (на сервере медиа-запросов нет — первый рендер совпадает с серверным).
 */
export function useReducedMotion(): boolean {
  const { prefersReducedMotion } = useJournalDeps();
  const [isReduced, setIsReduced] = useState(false);
  useEffect(() => {
    setIsReduced(prefersReducedMotion());
  }, [prefersReducedMotion]);
  return isReduced;
}
