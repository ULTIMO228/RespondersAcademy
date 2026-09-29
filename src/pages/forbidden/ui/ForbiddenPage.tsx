import { ROLE_HOME } from "@/features/auth-form";
import { getSessionUser } from "@/entities/user/index.server";

import { ForbiddenView } from "./ForbiddenView";

/** `/forbidden` (и rewrite proxy со статусом 403 при чужой роли): ссылка в раздел своей роли. */
export async function ForbiddenPage() {
  const sessionUser = await getSessionUser();
  return <ForbiddenView homeHref={sessionUser ? ROLE_HOME[sessionUser.user.role] : null} />;
}
