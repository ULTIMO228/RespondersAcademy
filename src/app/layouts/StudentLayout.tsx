import type { ReactNode } from "react";

import { RoleLayout } from "./RoleLayout";

export function StudentLayout({ children }: { children: ReactNode }) {
  return <RoleLayout role="student">{children}</RoleLayout>;
}
