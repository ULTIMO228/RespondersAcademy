import type { Metadata } from "next";

import "@/app/styles/global.css";
import "@/shared/ui/styles/vars.css";

export const metadata: Metadata = {
  title: "Поиск происшествий — учебный АРМ-112",
  description: "Статичный прототип главного экрана АРМ-112",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
