"use client";

import { useState } from "react";

import { AuthForm } from "@/features/auth-form";
import type { AuthCredentials } from "@/features/auth-form";
import { putAiSettings } from "@/shared/api";
import type { LoginResult, UserRole } from "@/shared/api";
import { createWebStorage } from "@/shared/lib";
import { Alert, Field } from "@/shared/ui/platform";

import type { DemoAccount } from "../model/authAccounts";
import { DemoAccessPanel } from "./DemoAccessPanel";
import styles from "./LoginPage.module.css";

/** Ключ в sessionStorage вкладки: до входа никуда не отправляется, после входа очищается. */
export const POLZA_KEY_STORAGE = "arm112_polza_key";

const sessionStore = createWebStorage(() => window.sessionStorage);

const KEY_HINT =
  "Нужен для проверки при масштабировании: облачная модель и живой ИИ-заявитель. Без ключа система работает локально.";
const NOT_ADMIN_HINT = "Ключ сохраняет администратор (admin)";
const SAVED_MESSAGE = "Ключ сохранён";
const SAVE_FAILED_MESSAGE = "Не удалось сохранить ключ. Его можно задать в настройках ИИ.";

type KeyNotice = { tone: "success" | "danger" | "info"; text: string };

type LoginFormAreaProps = {
  isDemoMode: boolean;
  initialCredentials?: AuthCredentials;
  accounts: DemoAccount[];
  roleTitles: Record<UserRole, string>;
  returnUrl?: string | null;
  /** Сколько показывать уведомление о ключе до перехода, мс (в тестах 0). */
  noticeDelayMs?: number;
};

/** Форма входа + демо-доступ с полем «Ключ Polza.ai» (только демо-режим). */
export function LoginFormArea({
  isDemoMode,
  initialCredentials,
  accounts,
  roleTitles,
  returnUrl,
  noticeDelayMs = 1500,
}: LoginFormAreaProps) {
  const [apiKey, setApiKey] = useState(() => (isDemoMode ? (sessionStore.get(POLZA_KEY_STORAGE) ?? "") : ""));
  const [notice, setNotice] = useState<KeyNotice | null>(null);

  function changeKey(value: string) {
    setApiKey(value);
    if (value) sessionStore.set(POLZA_KEY_STORAGE, value);
    else sessionStore.remove(POLZA_KEY_STORAGE);
  }

  /** После входа: admin — отправляем ключ в настройки ИИ; иначе ключ не уходит никуда. */
  async function handleLoggedIn(result: LoginResult) {
    const key = apiKey.trim();
    if (!isDemoMode || !key) return;
    if (result.role === "admin") {
      try {
        await putAiSettings({ source: "cloud", apiKey: key });
        setNotice({ tone: "success", text: SAVED_MESSAGE });
      } catch {
        setNotice({ tone: "danger", text: SAVE_FAILED_MESSAGE });
      }
    } else {
      setNotice({ tone: "info", text: NOT_ADMIN_HINT });
    }
    sessionStore.remove(POLZA_KEY_STORAGE);
    setApiKey("");
    await new Promise((resolve) => setTimeout(resolve, noticeDelayMs));
  }

  return (
    <>
      <AuthForm initialCredentials={initialCredentials} returnUrl={returnUrl} onLoggedIn={handleLoggedIn} />
      {isDemoMode ? (
        <DemoAccessPanel accounts={accounts} roleTitles={roleTitles} returnUrl={returnUrl}>
          <div className={styles["login__key"]}>
            <Field
              label="Ключ Polza.ai"
              name="polza-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              hint={KEY_HINT}
              onChange={(event) => changeKey(event.target.value)}
            />
          </div>
        </DemoAccessPanel>
      ) : null}
      {notice ? (
        <Alert tone={notice.tone} role="status">
          {notice.text}
        </Alert>
      ) : null}
    </>
  );
}
