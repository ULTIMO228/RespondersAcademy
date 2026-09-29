import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/features/auth-form";
import { getSessionUser } from "@/entities/user/index.server";
import { ROUTES } from "@/shared/config";

/** Корень `/`: без действующей сессии → вход, иначе главная страница роли. */
export async function RootRedirect() {
  const session = await getSessionUser().catch(() => null);
  redirect(session ? ROLE_HOME[session.user.role] : ROUTES.login);
}
