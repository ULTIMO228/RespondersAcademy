import type { ReactNode } from "react";

import { PlatformLayout } from "./PlatformLayout";

export function AdminLayout({ children }: { children: ReactNode }) {
  return <PlatformLayout role="admin">{children}</PlatformLayout>;
}
