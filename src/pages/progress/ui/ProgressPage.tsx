import { getSessionUser } from "@/entities/user/index.server";

import { ProgressScreen } from "./ProgressScreen";

/**
 * `/arm/progress` — «Мой прогресс» обучающегося (spec/04-pages/04-arm-progress.md). Серверный компонент:
 * курсант — пользователь сессии (гвард — proxy + лэйаут); данные грузит клиент из мок-API только свои.
 */
export async function ProgressPage() {
  const sessionUser = await getSessionUser();
  return sessionUser ? <ProgressScreen fullName={sessionUser.user.fullName} /> : null;
}
