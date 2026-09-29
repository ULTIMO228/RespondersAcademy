import type { ReactNode } from "react";

import { requireSessionUser } from "@/entities/user/index.server";
import { SimulatorBar } from "@/widgets/simulator-bar";
import type { UserRole } from "@/shared/api";

import { AuthSessionProvider } from "../session";
import { ThemeRoot } from "./ThemeRoot";

type GuardedThemeLayoutProps = {
  role: UserRole;
  theme: "light" | "dark";
  children: ReactNode;
};

/** Экран раздела без шапки (журнал /arm, карточка): гвард роли + сессия + автовыход. */
export async function GuardedThemeLayout({ role, theme, children }: GuardedThemeLayoutProps) {
  const { user } = await requireSessionUser(role);
  return (
    <AuthSessionProvider user={user}>
      <ThemeRoot theme={theme}>
        <SimulatorBar />
        {children}
      </ThemeRoot>
    </AuthSessionProvider>
  );
}
