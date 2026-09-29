import Link from "next/link";
import type { ReactNode } from "react";

import { PfIcon } from "./PfIcon";
import type { PfIconName } from "./PfIcon";
import styles from "./shell.module.css";

const DISCLAIMER = "Учебная система. Не является рабочей системой-112";

type PlatformShellProps = {
  brandHref: string;
  nav: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

/**
 * Оболочка платформы: боковая панель (пункты по роли), верхняя полоса и содержимое. Постоянная плашка «Учебная система…»
 * (граница ТЗ §4) стоит внизу боковой панели на каждой странице. `data-theme="light"` даёт токены АРМ существующим
 * страницам преподавателя и администратора, которые переезжают в оболочку без переписывания (T039).
 */
export function PlatformShell({ brandHref, nav, topbar, children }: PlatformShellProps) {
  return (
    <div className={styles.shell} data-theme="light" data-zone="platform">
      <a className={styles.skipLink} href="#platform-main">
        К содержимому
      </a>
      <aside className={styles.sidebar} aria-label="Разделы кабинета">
        <Link className={styles.brand} href={brandHref}>
          <span className={styles.brand__mark}>112</span>
          <span className={styles.brand__name}>
            Учебный тренажёр
            <br />
            оператора ДДС
          </span>
        </Link>
        {nav}
        <p className={styles.sidebar__note}>{DISCLAIMER}</p>
      </aside>
      <div>
        {topbar}
        <main id="platform-main" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

export type SideNavItem = {
  href: string;
  title: string;
  icon: PfIconName;
  active: boolean;
  /** Отдельный переход (в симулятор) — рамка вокруг пункта. */
  outlined?: boolean;
  /** Пункт после разделителя. */
  separatorBefore?: boolean;
};

export function SideNav({ items }: { items: SideNavItem[] }) {
  return (
    <nav aria-label="Разделы">
      <ul className={styles.nav}>
        {items.map((item) => (
          <li key={item.href} role="none">
            {item.separatorBefore ? <div className={styles.nav__separator} role="separator" /> : null}
            <Link
              href={item.href}
              className={[styles.nav__link, item.outlined ? styles["nav__link--outlined"] : ""]
                .filter(Boolean)
                .join(" ")}
              aria-current={item.active ? "page" : undefined}
            >
              <PfIcon name={item.icon} />
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type Crumb = { title: string; href?: string };

type TopbarProps = {
  crumbs: Crumb[];
  search: ReactNode;
  user: { initials: string; name: string; roleTitle: string };
  logout: ReactNode;
};

/** Верхняя полоса: хлебные крошки, поиск по справочнику, пользователь и выход. */
export function Topbar({ crumbs, search, user, logout }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <nav aria-label="Хлебные крошки">
        <ol className={styles.crumbs}>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li
                key={`${crumb.title}-${index}`}
                className={styles.crumbs__item}
                aria-current={last ? "page" : undefined}
              >
                {!last && crumb.href ? <Link href={crumb.href}>{crumb.title}</Link> : crumb.title}
                {last ? null : (
                  <span className={styles.crumbs__separator} aria-hidden="true">
                    {" "}
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className={styles.topbar__right}>
        {search}
        <div className={styles.user}>
          <span className={styles.user__avatar} aria-hidden="true">
            {user.initials}
          </span>
          <div>
            <div>{user.name}</div>
            <div className={styles.user__role}>{user.roleTitle}</div>
          </div>
        </div>
        {logout}
      </div>
    </header>
  );
}

type SearchFormProps = {
  action: string;
  name: string;
  label: string;
  placeholder: string;
};

/** Поле поиска верхней полосы: обычная GET-форма (работает без JS), с видимым фокусом. */
export function SearchForm({ action, name, label, placeholder }: SearchFormProps) {
  return (
    <form action={action} role="search" className={styles.search}>
      <PfIcon name="search" size={18} />
      <input
        type="search"
        name={name}
        aria-label={label}
        placeholder={placeholder}
        className={styles.search__input}
      />
    </form>
  );
}

/** Класс ссылки «Выйти» верхней полосы (LogoutLink принимает className). */
export const logoutLinkClassName = styles.logout;
