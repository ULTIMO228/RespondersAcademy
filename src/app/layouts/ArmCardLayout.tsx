import type { ReactNode } from "react";

import { GuardedThemeLayout } from "./GuardedThemeLayout";

/** `/arm/card/[cardId]` — карточка происшествия, светлая тема без шапки, только обучающийся; специалисту-112 закрыта (spec/008). */
export function ArmCardLayout({ children }: { children: ReactNode }) {
  return (
    <GuardedThemeLayout role="student" theme="light" mode="dds">
      {children}
    </GuardedThemeLayout>
  );
}
