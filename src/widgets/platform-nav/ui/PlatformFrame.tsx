"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutLink, ROLE_TITLES, zonesOf } from "@/entities/user";
import type { PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  logoutLinkClassName,
  PfIcon,
  PlatformShell,
  SearchForm,
  SideNav,
  Topbar,
} from "@/shared/ui/platform";
import type { SideNavItem } from "@/shared/ui/platform";

import { isNavEntryActive, isWorkspaceRoute, PLATFORM_NAV, resolvePlatformNav } from "../config/navItems";
import { resolveCrumbs } from "../lib/breadcrumbs";
import { toInitials, toShortName } from "../lib/initials";

type PlatformFrameProps = {
  user: PublicUser;
  children: ReactNode;
};

/**
 * Рамка платформы: боковая панель по роли, верхняя полоса (крошки, поиск по справочнику, пользователь, выход) и плашка
 * «Учебная система…». Рисуется вокруг страниц кабинетов; симулятор `/arm/*` её не использует (правило №1).
 */
export function PlatformFrame({ user, children }: PlatformFrameProps) {
  const pathname = usePathname() ?? "";
  const items: SideNavItem[] = resolvePlatformNav(user.role, zonesOf(user)).map((entry) => ({
    href: entry.href,
    title: entry.title,
    icon: entry.icon,
    active: isNavEntryActive(entry, pathname),
    outlined: entry.outlined,
    separatorBefore: entry.separatorBefore,
  }));
  const workspace = isWorkspaceRoute(pathname);
  return (
    <PlatformShell
      brandHref={PLATFORM_NAV[user.role][0].href}
      workspace={workspace}
      nav={<SideNav items={items} compact={workspace} />}
      topbar={
        <Topbar
          crumbs={resolveCrumbs(user.role, pathname)}
          search={
            <SearchForm
              action={ROUTES.reference}
              name="q"
              label="Поиск по справочнику"
              placeholder="Поиск по справочнику"
            />
          }
          user={{
            initials: toInitials(user.fullName),
            name: toShortName(user.fullName),
            roleTitle: ROLE_TITLES[user.role],
          }}
          logout={
            <LogoutLink className={logoutLinkClassName} title="Выйти">
              <PfIcon name="logout" size={18} /> Выйти
            </LogoutLink>
          }
        />
      }
    >
      {children}
    </PlatformShell>
  );
}
