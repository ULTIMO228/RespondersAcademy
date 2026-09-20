import type { ReactNode } from "react";

import { AppNav } from "@/widgets/app-nav";
import { ROLE_TITLES } from "@/entities/user";
import { requireSessionUser } from "@/entities/user/index.server";
import type { UserRole } from "@/shared/api";

import { AuthSessionProvider } from "../session";
import styles from "./RoleLayout.module.css";

type RoleLayoutProps = {
  role: UserRole;
  children: ReactNode;
};

/**
 * Лэйаут раздела роли: гвард (proxy — основной; здесь — вторая линия), светлая тема ПОВ-112,
 * шапка с пользователем сессии и автовыход через 24 ч.
 */
export async function RoleLayout({ role, children }: RoleLayoutProps) {
  const { session, user } = await requireSessionUser(role);
  return (
    <AuthSessionProvider session={session}>
      <div className={styles.layout} data-theme="light">
        <AppNav
          role={role}
          roleTitle={ROLE_TITLES[role]}
          userName={user.fullName}
          armNumber={user.armNumber}
        />
        <main className={styles.layout__main}>{children}</main>
      </div>
    </AuthSessionProvider>
  );
}
