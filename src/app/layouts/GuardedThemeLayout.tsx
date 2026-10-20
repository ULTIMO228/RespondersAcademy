import type { ReactNode } from "react";

import { zonesOf } from "@/entities/user";
import { requireSpecialization } from "@/entities/user/index.server";
import { SimulatorBar } from "@/widgets/simulator-bar";
import type { Specialization } from "@/shared/api";

import { AuthSessionProvider } from "../session";
import { ThemeRoot } from "./ThemeRoot";

type GuardedThemeLayoutProps = {
  /** Рабочая зона симулятора: нужна специализация обучающегося (спека 007). */
  zone: Specialization;
  theme: "light" | "dark";
  children: ReactNode;
};

/** Экран раздела без шапки (журнал /arm, карточка): гвард роли и специализации + сессия + автовыход. */
export async function GuardedThemeLayout({ zone, theme, children }: GuardedThemeLayoutProps) {
  const { user } = await requireSpecialization(zone);
  return (
    <AuthSessionProvider user={user}>
      <ThemeRoot theme={theme}>
        <SimulatorBar zones={zonesOf(user)} currentZone={zone} />
        {children}
      </ThemeRoot>
    </AuthSessionProvider>
  );
}
