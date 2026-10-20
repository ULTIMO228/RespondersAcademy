import type { ReactNode } from "react";

import { SimulatorBar } from "@/widgets/simulator-bar";
import { requireSessionUser } from "@/entities/user/index.server";

import { AuthSessionProvider } from "../session";
import styles from "./ArmSectionLayout.module.css";

/**
 * Рабочее место специалиста-112 (спека 009, FR-003): над карточкой ПОВ-112 — только полоса тренажёра, без шапки
 * «журнал · софтфон · прогресс · справка». Учебные таймеры и подсказки экран выводит в слот полосы.
 */
export async function ArmOperator112Layout({ children }: { children: ReactNode }) {
  const { user } = await requireSessionUser("student");
  return (
    <AuthSessionProvider user={user}>
      <div className={styles.layout} data-theme="light">
        <SimulatorBar />
        <main>{children}</main>
      </div>
    </AuthSessionProvider>
  );
}
