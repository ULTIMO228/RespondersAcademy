import type { ReactNode } from "react";

import { requireSessionUser } from "@/entities/user/index.server";

/** Страница общего раздела (`/account/*`), доступная только администратору: чужая роль → /forbidden. */
export async function AdminOnlyLayout({ children }: { children: ReactNode }) {
  await requireSessionUser("admin");
  return <>{children}</>;
}
