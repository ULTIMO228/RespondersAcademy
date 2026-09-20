import type { ReactNode } from "react";

import { ThemeRoot } from "./ThemeRoot";

/** Карточка происшествия и вход — светлая тема без шапки раздела (как в ПОВ-112). */
export function LightArmLayout({ children }: { children: ReactNode }) {
  return <ThemeRoot theme="light">{children}</ThemeRoot>;
}
