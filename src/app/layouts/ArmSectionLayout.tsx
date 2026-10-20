import type { ReactNode } from "react";

import { AppNav } from "@/widgets/app-nav";
import { SimulatorBar } from "@/widgets/simulator-bar";
import { ROLE_TITLES, zonesOf } from "@/entities/user";
import { requireSpecialization } from "@/entities/user/index.server";
import type { Specialization } from "@/shared/api";

import { AuthSessionProvider } from "../session";
import styles from "./ArmSectionLayout.module.css";

type ArmSectionLayoutProps = {
  /** Рабочая зона раздела: нужна специализация обучающегося (спека 007). */
  zone: Specialization;
  children: ReactNode;
};

/**
 * Разделы симулятора со светлой темой ПОВ-112 и шапкой АРМ (софтфон ДДС, режим «Специалист-112»): гвард роли и
 * специализации, панель «В кабинет» над шапкой и 401 → вход. Вид самого АРМ не меняется (правило №1).
 */
export async function ArmSectionLayout({ zone, children }: ArmSectionLayoutProps) {
  const { user } = await requireSpecialization(zone);
  return (
    <AuthSessionProvider user={user}>
      <div className={styles.layout} data-theme="light">
        <SimulatorBar zones={zonesOf(user)} currentZone={zone} />
        <AppNav
          role="student"
          roleTitle={ROLE_TITLES.student}
          userName={user.fullName}
          armNumber={user.armNumber}
          zones={zonesOf(user)}
        />
        <main className={styles.layout__main}>{children}</main>
      </div>
    </AuthSessionProvider>
  );
}

/** `/arm/phone` — софтфон ДДС (связь со службами): зона ДДС. Софтфон 112 встроен в `/arm/operator112`. */
export function ArmPhoneLayout({ children }: { children: ReactNode }) {
  return <ArmSectionLayout zone="dds">{children}</ArmSectionLayout>;
}

/** `/arm/operator112` — режим «Специалист-112»: зона 112. */
export function ArmOperator112Layout({ children }: { children: ReactNode }) {
  return <ArmSectionLayout zone="operator112">{children}</ArmSectionLayout>;
}
