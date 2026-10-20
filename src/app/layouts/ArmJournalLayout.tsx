import type { ReactNode } from "react";

import { GuardedThemeLayout } from "./GuardedThemeLayout";

/** `/arm` — «Поиск происшествий», тёмная тема, обучающийся со специализацией ДДС (spec/000-фронт/02-roles.md). */
export function ArmJournalLayout({ children }: { children: ReactNode }) {
  return (
    <GuardedThemeLayout zone="dds" theme="dark">
      {children}
    </GuardedThemeLayout>
  );
}
