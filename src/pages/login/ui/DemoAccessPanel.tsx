import Link from "next/link";

import { LOGIN_QUERY } from "@/entities/user";
import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import { DEMO_ROLE_QUERY, ROLE_SHORTCUTS } from "../config/loginContent";
import type { DemoAccount } from "../model/authAccounts";
import styles from "./LoginPage.module.css";

type DemoAccessPanelProps = {
  accounts: DemoAccount[];
  roleTitles: Record<UserRole, string>;
  /** returnUrl гварда сохраняется при переключении демо-учётки. */
  returnUrl?: string | null;
};

/** Подсказки тестовых учёток (только демо-режим) и ссылки «Войти как …» (предзаполнение формы). */
export function DemoAccessPanel({ accounts, roleTitles, returnUrl }: DemoAccessPanelProps) {
  const returnQuery = returnUrl ? { [LOGIN_QUERY.returnUrl]: returnUrl } : {};
  return (
    <details className={styles["login__demo"]}>
      <summary className={styles["login__demo-title"]}>
        Тестовые учётные записи (демо-режим):
      </summary>
      <ul className={styles["login__demo-list"]}>
        {accounts.map((account) => (
          <li key={account.login}>
            {roleTitles[account.role]}: <strong>{account.login}</strong> / {account.password} · АРМ{" "}
            {account.armNumber}
            {account.isActive ? "" : " — заблокирована"}
          </li>
        ))}
      </ul>
      <p className={styles["login__shortcuts"]}>
        Войти как:
        {ROLE_SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.role}
            href={{ pathname: ROUTES.login, query: { ...returnQuery, [DEMO_ROLE_QUERY]: shortcut.role } }}
            className={styles["login__shortcut"]}
            replace
          >
            {shortcut.label}
          </Link>
        ))}
      </p>
    </details>
  );
}
