import type { ReactNode } from "react";

import { PlatformLayout } from "./PlatformLayout";

export function StudentLayout({ children }: { children: ReactNode }) {
  return <PlatformLayout role="student">{children}</PlatformLayout>;
}
