"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLogoutAll } from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { Alert, Card, PlatformButton } from "@/shared/ui/platform";

import styles from "./Account.module.css";

type Step = "idle" | "confirm" | "pending";

/** «Выйти на всех устройствах» с подтверждением: сервер отзывает все сессии, включая эту, — затем вход. */
export function LogoutAllCard() {
  const router = useRouter();
  const logoutAll = useLogoutAll();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setStep("pending");
    setError(null);
    try {
      await logoutAll();
      router.replace(ROUTES.login);
    } catch {
      setStep("confirm");
      setError("Не удалось завершить сессии. Повторите попытку");
    }
  }

  return (
    <Card title="Сессии">
      <p className={styles.text}>
        Завершит вход на всех устройствах, включая это. Понадобится ввести логин и пароль заново.
      </p>
      {step === "idle" ? (
        <PlatformButton onClick={() => setStep("confirm")}>Выйти на всех устройствах</PlatformButton>
      ) : (
        <div className={styles.confirm}>
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <Alert tone="warning">Выйти на всех устройствах? Текущая сессия тоже будет завершена.</Alert>
          <div className={styles.confirm__actions}>
            <PlatformButton
              variant="primary"
              onClick={confirm}
              disabled={step === "pending"}
              aria-busy={step === "pending"}
            >
              Да, выйти везде
            </PlatformButton>
            <PlatformButton onClick={() => setStep("idle")} disabled={step === "pending"}>
              Отмена
            </PlatformButton>
          </div>
        </div>
      )}
    </Card>
  );
}
