import Link from "next/link";

import { LogoutLink } from "@/entities/user";
import { Panel } from "@/shared/ui";

import { FORBIDDEN_TEXT } from "../config/forbiddenContent";
import styles from "./ForbiddenPage.module.css";

type ForbiddenViewProps = {
  /** Раздел роли текущей сессии (нет сессии — ссылка не показывается). */
  homeHref: string | null;
};

/** 403 «Доступ запрещён» — светлая тема, без шапки раздела. */
export function ForbiddenView({ homeHref }: ForbiddenViewProps) {
  return (
    <main className={styles.forbidden} data-theme="light">
      <h1 className="visually-hidden">
        {FORBIDDEN_TEXT.title} — {FORBIDDEN_TEXT.code}
      </h1>
      <Panel className={styles.forbidden__panel} title={FORBIDDEN_TEXT.title} headerTone="dark">
        <p className={styles.forbidden__code}>{FORBIDDEN_TEXT.code}</p>
        <p className={styles.forbidden__text}>{FORBIDDEN_TEXT.description}</p>
        <p className={styles.forbidden__actions}>
          {homeHref ? (
            <Link href={homeHref} className={styles.forbidden__link}>
              {FORBIDDEN_TEXT.home}
            </Link>
          ) : null}
          <LogoutLink className={styles.forbidden__link}>{FORBIDDEN_TEXT.relogin}</LogoutLink>
        </p>
      </Panel>
    </main>
  );
}
