"use client";

import { useEffect, useState } from "react";

/** Сколько видна плашка-уведомление (молния «важное», подсказка Insert). */
export const NOTICE_VISIBLE_MS = 8000;

/** Плашка-уведомление ленты (role=status): последняя заменяет предыдущую, скрывается сама. */
export function useNotice() {
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const handle = setTimeout(() => setNotice(null), NOTICE_VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [notice]);

  return {
    notice: notice?.text ?? null,
    show: (text: string) => setNotice((current) => ({ id: (current?.id ?? 0) + 1, text })),
    hide: () => setNotice(null),
  };
}
