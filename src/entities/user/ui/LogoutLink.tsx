"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { ROUTES } from "@/shared/config";

import { useLogout } from "../model/useAuthSession";

type LogoutLinkProps = Omit<ComponentProps<typeof Link>, "href">;

/** Ссылка «выйти»: завершает сессию (очищает cookie) и ведёт на /login. Вид задаёт вызывающий (className). */
export function LogoutLink({ onClick, ...rest }: LogoutLinkProps) {
  const logout = useLogout();
  return (
    <Link
      href={ROUTES.login}
      prefetch={false}
      onClick={(event) => {
        logout();
        onClick?.(event);
      }}
      {...rest}
    />
  );
}
