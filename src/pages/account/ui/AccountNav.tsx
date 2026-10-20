"use client";

import { useSessionUser } from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { LinkButton } from "@/shared/ui/platform";

import styles from "./Account.module.css";

type AccountSection = "profile" | "security" | "ai";

/** Переключатель разделов профиля: «Профиль», «Безопасность» и (только администратору) «Модель ИИ». */
export function AccountNav({ active }: { active: AccountSection }) {
  const isAdmin = useSessionUser()?.role === "admin";
  return (
    <nav className={styles.nav} aria-label="Разделы профиля">
      <LinkButton
        href={ROUTES.account}
        variant={active === "profile" ? "primary" : "secondary"}
        aria-current={active === "profile" ? "page" : undefined}
      >
        Профиль
      </LinkButton>
      <LinkButton
        href={ROUTES.accountSecurity}
        variant={active === "security" ? "primary" : "secondary"}
        aria-current={active === "security" ? "page" : undefined}
      >
        Безопасность
      </LinkButton>
      {isAdmin ? (
        <LinkButton
          href={ROUTES.accountAi}
          variant={active === "ai" ? "primary" : "secondary"}
          aria-current={active === "ai" ? "page" : undefined}
        >
          Модель ИИ
        </LinkButton>
      ) : null}
    </nav>
  );
}
