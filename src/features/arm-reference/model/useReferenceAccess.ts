"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReferencePanelApi } from "./referenceApi";

export type AccessState = "checking" | "allowed" | "locked" | "unknown";

/** Период перепроверки доступа: окно справочника на втором мониторе закрывается, когда начинается попытка с запретом. */
export const ACCESS_RECHECK_MS = 15_000;

/**
 * Доступ к справочнику (спека 005). Проверяется при монтировании, при возврате фокуса окну и, если `poll`, раз в 15 с.
 * Ошибка сети — «unknown»: кнопку не прячем, сервер всё равно ответит 403 на статьи при запрете.
 */
export function useReferenceAccess(
  api: ReferencePanelApi,
  poll = false,
): { state: AccessState; recheck: () => void } {
  const [state, setState] = useState<AccessState>("checking");
  const recheck = useCallback(() => {
    api.access().then(
      (result) => setState(result.allowed ? "allowed" : "locked"),
      () => setState("unknown"),
    );
  }, [api]);
  useEffect(() => {
    recheck();
    window.addEventListener("focus", recheck);
    const timer = poll ? window.setInterval(recheck, ACCESS_RECHECK_MS) : undefined;
    return () => {
      window.removeEventListener("focus", recheck);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [poll, recheck]);
  return { state, recheck };
}
