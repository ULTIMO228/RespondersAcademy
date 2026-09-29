"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { ROUTES } from "@/shared/config";

import { useLogout } from "../model/useSessionUser";

type LogoutLinkProps = Omit<ComponentProps<typeof Link>, "href">;

/**
 * Ссылка «выйти»: запрос на сервер (он отзывает сессию и очищает cookie) уходит по клику, переход на /login идёт как
 * обычная навигация ссылки — /login вне гварда, поэтому ждать ответа не нужно. Вид задаёт вызывающий (className).
 */
export function LogoutLink({ onClick, ...rest }: LogoutLinkProps) {
  const logout = useLogout();
  return (
    <Link
      href={ROUTES.login}
      prefetch={false}
      onClick={(event) => {
        void logout();
        onClick?.(event);
      }}
      {...rest}
    />
  );
}
