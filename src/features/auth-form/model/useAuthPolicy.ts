"use client";

import { useEffect, useState } from "react";

import { getAuthPolicy } from "@/shared/api";
import type { AuthPolicy } from "@/shared/api";

/** Подменяемый запрос политики входа (в тестах — стаб вместо GET /auth/policy). */
export type AuthPolicyRequestFn = (signal?: AbortSignal) => Promise<AuthPolicy>;

const defaultRequest: AuthPolicyRequestFn = (signal) => getAuthPolicy(undefined, signal);

/**
 * Политика входа с `/admin/system` → `SystemSettings.security` (T4.2-17): администратор выключает
 * «Требовать 2FA» — форма перестаёт спрашивать код. До ответа и при ошибке действует «2FA включена»
 * (безопасное значение по умолчанию, ТЗ §5), поверх него остаётся флаг окружения.
 */
export function useAuthPolicy(request: AuthPolicyRequestFn = defaultRequest): boolean {
  const [twoFactorRequired, setTwoFactorRequired] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    void (async () => {
      try {
        const policy = await request(controller.signal);
        if (isActive) setTwoFactorRequired(policy.twoFactorRequired);
      } catch {
        /* политика недоступна — остаётся безопасное значение по умолчанию (2FA включена). */
      }
    })();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [request]);
  return twoFactorRequired;
}
