/* Next 16 Proxy (бывший middleware): гвард разделов ролей. Логика — src/app/proxy (FSD-слой app). */
import type { NextRequest } from "next/server";

import { authProxy } from "@/app/proxy";

export function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  matcher: ["/arm/:path*", "/teacher/:path*", "/admin/:path*"],
};
