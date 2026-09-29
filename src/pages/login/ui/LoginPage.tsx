import { redirect } from "next/navigation";

import { AuthForm, resolvePostLoginRoute } from "@/features/auth-form";
import { ROLE_TITLES } from "@/entities/user";
import { getSessionUser } from "@/entities/user/index.server";
import { APP_ENV } from "@/shared/config";
import { Alert } from "@/shared/ui/platform";

import {
  BRAND_FACTS,
  BRAND_LEAD,
  BRAND_TITLE,
  SESSION_EXPIRED_MESSAGE,
  SUPPORT_CONTACTS,
  TRAINING_DISCLAIMER,
} from "../config/loginContent";
import { pickDemoAccounts, pickDemoCredentials } from "../model/authAccounts";
import { readLoginParams } from "../model/loginParams";
import type { LoginParams, LoginSearchParams } from "../model/loginParams";
import { CityIllustration } from "./CityIllustration";
import { DemoAccessPanel } from "./DemoAccessPanel";
import styles from "./LoginPage.module.css";

type LoginScreenProps = LoginParams & {
  isDemoMode: boolean;
};

/**
 * `/login` — вход платформы (спека 002, T040): логин и пароль, без номера АРМ и шага 2FA (A14). Фон — городская
 * иллюстрация; текст лежит на сплошных карточках (контраст AA). Плашка «Учебная система…» видна без прокрутки (ТЗ §4).
 */
export function LoginScreen({ isDemoMode, returnUrl, isSessionExpired, demoRole }: LoginScreenProps) {
  return (
    <main className={styles.login}>
      <CityIllustration />
      <section className={styles.login__intro} aria-label="О тренажёре">
        <div className={styles.login__mark} aria-hidden="true">
          112
        </div>
        <h1 className={styles.login__heading}>{BRAND_TITLE}</h1>
        <p className={styles.login__lead}>{BRAND_LEAD}</p>
        <ul className={styles.login__facts}>
          {BRAND_FACTS.map((fact) => (
            <li key={fact.value}>
              <b>{fact.value}</b>
              <span>{fact.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className={styles.login__panel}>
        <div className={styles.login__card}>
          {isSessionExpired ? <Alert tone="warning">{SESSION_EXPIRED_MESSAGE}</Alert> : null}
          <AuthForm
            key={demoRole}
            initialCredentials={isDemoMode ? pickDemoCredentials(demoRole) : undefined}
            returnUrl={returnUrl}
          />
          {isDemoMode ? (
            <DemoAccessPanel accounts={pickDemoAccounts()} roleTitles={ROLE_TITLES} returnUrl={returnUrl} />
          ) : null}
          <address className={styles.login__support}>
            {SUPPORT_CONTACTS.title}: {SUPPORT_CONTACTS.phone} ·{" "}
            <a href={`mailto:${SUPPORT_CONTACTS.email}`} className={styles["login__support-link"]}>
              {SUPPORT_CONTACTS.email}
            </a>
          </address>
        </div>
      </div>
      <p className={styles.login__disclaimer}>{TRAINING_DISCLAIMER}</p>
    </main>
  );
}

type LoginPageProps = {
  searchParams: Promise<LoginSearchParams>;
};

/** Действующая сессия на сервере; нет связи с сервером — вход показывается как обычно. */
async function readActiveSession() {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}

/**
 * Роут `/login`: параметры гвардов (returnUrl, reason) и флаг демо-режима. Уже вошедшего пользователя сразу ведём
 * в свой раздел (или на returnUrl, если роль имеет к нему доступ); недействительная сессия показывает форму.
 */
export async function LoginPage({ searchParams }: LoginPageProps) {
  const params = readLoginParams(await searchParams);
  const session = await readActiveSession();
  if (session) redirect(resolvePostLoginRoute(session.user.role, params.returnUrl));
  return <LoginScreen {...params} isDemoMode={APP_ENV.isDemoMode} />;
}
