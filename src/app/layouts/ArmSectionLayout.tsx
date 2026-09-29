import type { ReactNode } from "react";

import { AppNav } from "@/widgets/app-nav";
import { SimulatorBar } from "@/widgets/simulator-bar";
import { ROLE_TITLES } from "@/entities/user";
import { requireSessionUser } from "@/entities/user/index.server";

import { AuthSessionProvider } from "../session";
import styles from "./ArmSectionLayout.module.css";

/**
 * Разделы симулятора со светлой темой ПОВ-112 и шапкой АРМ (софтфон, режим «Специалист-112»): гвард роли обучающегося,
 * панель «В кабинет» над шапкой и 401 → вход. Вид самого АРМ не меняется (правило №1).
 */
export async function ArmSectionLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSessionUser("student");
  return (
    <AuthSessionProvider user={user}>
      <div className={styles.layout} data-theme="light">
        <SimulatorBar />
        <AppNav
          role="student"
          roleTitle={ROLE_TITLES.student}
          userName={user.fullName}
          armNumber={user.armNumber}
        />
        <main className={styles.layout__main}>{children}</main>
      </div>
    </AuthSessionProvider>
  );
}
