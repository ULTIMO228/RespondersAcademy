import type { ReactNode } from "react";

import { GuardedThemeLayout } from "./GuardedThemeLayout";

/** `/arm` — «Поиск происшествий», тёмная тема, только обучающийся (spec/02-roles.md). */
export function ArmJournalLayout({ children }: { children: ReactNode }) {
  return (
    <GuardedThemeLayout role="student" theme="dark">
      {children}
    </GuardedThemeLayout>
  );
}
