import type { ReactNode } from "react";

import { GuardedThemeLayout } from "./GuardedThemeLayout";

/** `/arm/card/[cardId]` — карточка происшествия, светлая тема без шапки, обучающийся со специализацией ДДС. */
export function ArmCardLayout({ children }: { children: ReactNode }) {
  return (
    <GuardedThemeLayout zone="dds" theme="light">
      {children}
    </GuardedThemeLayout>
  );
}
