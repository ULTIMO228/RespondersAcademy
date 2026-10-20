import type { ReactNode } from "react";

import { requireSessionUser } from "@/entities/user/index.server";

/**
 * Вложенный гвард экранов режима ДДС внутри общего раздела симулятора (`/arm/phone`): специалисту-112 → /forbidden
 * (spec/008, T041). Разметки не добавляет — шапку и полосу тренажёра рисует ArmSectionLayout.
 */
export async function ArmDdsGuardLayout({ children }: { children: ReactNode }) {
  await requireSessionUser("student", "dds");
  return children;
}
