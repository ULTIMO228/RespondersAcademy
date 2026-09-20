import { useState } from "react";

import { login, mapLoginError } from "@/shared/api";
import type { AuthSession, LoginRequest } from "@/shared/api";

export type LoginRequestFn = (request: LoginRequest) => Promise<AuthSession>;

/** Вызов POST /auth/login с состоянием pending и ошибкой для формы (текст — из маппера shared/api). */
export function useLoginRequest(loginRequest: LoginRequestFn = login) {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(request: LoginRequest): Promise<AuthSession | null> {
    setPending(true);
    setError(null);
    try {
      return await loginRequest(request);
    } catch (failure) {
      setError(mapLoginError(failure).message);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { isPending, error, setError, submit };
}
