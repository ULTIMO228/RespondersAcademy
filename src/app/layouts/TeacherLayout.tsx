import type { ReactNode } from "react";

import { RoleLayout } from "./RoleLayout";

export function TeacherLayout({ children }: { children: ReactNode }) {
  return <RoleLayout role="teacher">{children}</RoleLayout>;
}
