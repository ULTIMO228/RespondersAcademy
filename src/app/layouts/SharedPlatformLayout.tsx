import type { ReactNode } from "react";

import { PlatformLayout } from "./PlatformLayout";

/** Справочник и профиль: доступны всем ролям. */
export function SharedPlatformLayout({ children }: { children: ReactNode }) {
  return <PlatformLayout>{children}</PlatformLayout>;
}
