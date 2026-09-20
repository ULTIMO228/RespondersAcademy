import type { ReactNode } from "react";

import "@/shared/ui/styles/vars.css";
import "./styles/global.css";

export function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
