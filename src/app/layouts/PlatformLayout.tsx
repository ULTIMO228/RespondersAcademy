import type { ReactNode } from "react";

import { requireSessionUser, verifySession } from "@/entities/user/index.server";
import type { UserRole } from "@/shared/api";
import { AiHealthBanner } from "@/widgets/ai-health-banner";
import { PlatformFrame } from "@/widgets/platform-nav";

import { AuthSessionProvider } from "../session";

type PlatformLayoutProps = {
  /** Роль раздела; без неё страница общая для всех ролей (справочник, профиль) — достаточно действующей сессии. */
  role?: UserRole;
  children: ReactNode;
};

/**
 * Лэйаут платформы (кабинеты и общие страницы): сервер подтверждает сессию (verifySession — основная защита, proxy
 * лишь оптимистичен), затем оболочка с навигацией по роли и автопереход на вход при потере сессии.
 * Баннер состояния ИИ (спека 006) видят админ и преподаватель; в симулятор он не попадает.
 * Симулятор `/arm/*` этот лэйаут не использует — он остаётся репликой АРМ-112.
 */
export async function PlatformLayout({ role, children }: PlatformLayoutProps) {
  const { user } = role ? await requireSessionUser(role) : await verifySession();
  return (
    <AuthSessionProvider user={user}>
      <PlatformFrame user={user}>
        <AiHealthBanner />
        {children}
      </PlatformFrame>
    </AuthSessionProvider>
  );
}
