import type { ReactNode } from "react";

import { SimulatorBar } from "@/widgets/simulator-bar";
import { zonesOf } from "@/entities/user";
import { requireSpecialization } from "@/entities/user/index.server";

import { AuthSessionProvider } from "../session";
import styles from "./ArmSectionLayout.module.css";

/**
 * Рабочее место специалиста-112 (спека 009, FR-003): над карточкой ПОВ-112 — только полоса тренажёра, без шапки
 * «журнал · софтфон · прогресс · справка». Учебные таймеры и подсказки экран выводит в слот полосы.
 * Гвард зоны 112 (спека 007): обучающийся без специализации «специалист 112» → /forbidden; с двумя специализациями
 * полоса показывает переключатель зон.
 */
export async function ArmOperator112Layout({ children }: { children: ReactNode }) {
  const { user } = await requireSpecialization("operator112");
  return (
    <AuthSessionProvider user={user}>
      <div className={styles.layout} data-theme="light">
        <SimulatorBar zones={zonesOf(user)} currentZone="operator112" />
        <main>{children}</main>
      </div>
    </AuthSessionProvider>
  );
}
