import type { ReactNode } from "react";

import { RoleLayout } from "./RoleLayout";

export function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleLayout role="admin">{children}</RoleLayout>;
}
