"use client";

import { useCallback, useState } from "react";

/** Открытие формы статуса: управляемое страницей (горячие клавиши) или локальное. */
export function useStatusFormState(isOpenProp?: boolean, onOpenChange?: (isOpen: boolean) => void) {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = isOpenProp ?? localOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      if (isOpenProp === undefined) setLocalOpen(next);
    },
    [isOpenProp, onOpenChange],
  );
  return [isOpen, setOpen] as const;
}
