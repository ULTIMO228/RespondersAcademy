import { ROLE_HOME } from "@/features/auth-form";
import { getServerSession } from "@/entities/user/index.server";

import { ForbiddenView } from "./ForbiddenView";

/** `/forbidden` (и rewrite proxy со статусом 403 при чужой роли): ссылка в раздел своей роли. */
export async function ForbiddenPage() {
  const session = await getServerSession();
  return <ForbiddenView homeHref={session ? ROLE_HOME[session.role] : null} />;
}
