import type { ReactNode } from "react";

import { PlatformLayout } from "./PlatformLayout";

export function TeacherLayout({ children }: { children: ReactNode }) {
  return <PlatformLayout role="teacher">{children}</PlatformLayout>;
}
