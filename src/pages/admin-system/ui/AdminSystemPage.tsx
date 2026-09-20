import { getSessionUser } from "@/entities/user/index.server";

import { SystemShell } from "./SystemShell";

/**
 * `/admin/system` (spec/04-pages/21): сервисы, мониторинг, настройки, журналы и аудит.
 * Серверный компонент: администратор — пользователь сессии (гвард — proxy + лэйаут),
 * данные вкладок грузит клиент через `@/shared/api`.
 */
export async function AdminSystemPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return <SystemShell adminId={sessionUser.user.id} />;
}
