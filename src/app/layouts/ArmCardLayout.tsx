import type { ReactNode } from "react";

import { GuardedThemeLayout } from "./GuardedThemeLayout";

/** `/arm/card/[cardId]` — карточка происшествия, светлая тема без шапки, только обучающийся. */
export function ArmCardLayout({ children }: { children: ReactNode }) {
  return (
    <GuardedThemeLayout role="student" theme="light">
      {children}
    </GuardedThemeLayout>
  );
}
