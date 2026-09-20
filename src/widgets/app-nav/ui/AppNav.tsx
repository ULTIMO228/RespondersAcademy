"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutLink } from "@/entities/user";
import { ROUTES } from "@/shared/config";
import type { UserRole } from "@/shared/api";
import { ArmIcon } from "@/shared/ui";

import { NAV_ITEMS } from "../config/navItems";

import styles from "./AppNav.module.css";

type AppNavProps = {
  role: UserRole;
  roleTitle: string;
  userName: string;
  armNumber: number;
};

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.arm || href === ROUTES.teacher) return pathname === href;
  return pathname.startsWith(href);
}

/** Шапка раздела в стиле тёмной панели ПОВ-112 (p12_Image66: вкладки разделов, активная — синяя). */
export function AppNav({ role, roleTitle, userName, armNumber }: AppNavProps) {
  const pathname = usePathname() ?? "";
  return (
    <header className={styles.nav}>
      <div className={styles.nav__brand}>
        <span className={styles.nav__logo}>112</span>
        <span className={styles.nav__role}>{roleTitle}</span>
      </div>
      <nav className={styles.nav__tabs} aria-label="Разделы">
        {NAV_ITEMS[role].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={[
              styles.nav__tab,
              isActive(pathname, item.href) ? styles["nav__tab--active"] : "",
            ].join(" ")}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <div className={styles.nav__user}>
        <span>
          {userName}, АРМ {String(armNumber).padStart(3, "0")}
        </span>
        <LogoutLink className={styles.nav__exit} title="Выйти">
          <ArmIcon name="top-exit" width={26} height={25} />
          <span>выйти</span>
        </LogoutLink>
      </div>
    </header>
  );
}
