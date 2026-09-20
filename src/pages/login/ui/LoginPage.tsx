import { AuthForm } from "@/features/auth-form";
import { ROLE_TITLES } from "@/entities/user";
import { APP_ENV } from "@/shared/config";

import {
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
  isTwoFactorEnabled: boolean;
};

/**
 * `/login` — «112 ВХОД В СИСТЕМУ» 1:1 по ДДС_image1.png (spec/04-pages/00-auth.md).
 * Тренажёрные добавления (бренд, пометка ТЗ §4, номер АРМ, 2FA, подсказки) — в той же типографике.
 */
export function LoginScreen({
  isDemoMode,
  isTwoFactorEnabled,
  returnUrl,
  isSessionExpired,
  demoRole,
}: LoginScreenProps) {
  return (
    <main className={styles.login}>
      <CityIllustration />
      <div className={styles.login__column}>
        <header className={styles.login__brand}>
          <p>{BRAND_TITLE}</p>
          <p className={styles.login__disclaimer}>{TRAINING_DISCLAIMER}</p>
        </header>
        <h1 className={styles.login__title}>
          <span className={styles.login__logo}>112</span>
          <span className={styles.login__caption}>ВХОД В СИСТЕМУ</span>
        </h1>
        {isSessionExpired ? (
          <p className={styles.login__notice} role="status">
            {SESSION_EXPIRED_MESSAGE}
          </p>
        ) : null}
        <AuthForm
          key={demoRole}
          initialCredentials={isDemoMode ? pickDemoCredentials(demoRole) : undefined}
          isTwoFactorEnabled={isTwoFactorEnabled}
          returnUrl={returnUrl}
        />
        <address className={styles.login__support}>
          <span>{SUPPORT_CONTACTS.title}</span>
          <span>{SUPPORT_CONTACTS.phone}</span>
          <a href={`mailto:${SUPPORT_CONTACTS.email}`} className={styles["login__support-link"]}>
            {SUPPORT_CONTACTS.email}
          </a>
        </address>
        {isDemoMode ? (
          <DemoAccessPanel accounts={pickDemoAccounts()} roleTitles={ROLE_TITLES} returnUrl={returnUrl} />
        ) : null}
      </div>
    </main>
  );
}

type LoginPageProps = {
  searchParams: Promise<LoginSearchParams>;
};

/** Роут `/login`: параметры гвардов (returnUrl, reason) + флаги shared/config (демо, 2FA). */
export async function LoginPage({ searchParams }: LoginPageProps) {
  const params = readLoginParams(await searchParams);
  return (
    <LoginScreen
      {...params}
      isDemoMode={APP_ENV.isDemoMode}
      isTwoFactorEnabled={APP_ENV.isTwoFactorEnabled}
    />
  );
}
