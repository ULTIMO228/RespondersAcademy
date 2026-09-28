import { IncidentJournal } from "@/widgets/incident-list";
import type { JournalDeps } from "@/widgets/incident-list";
import { getSessionUser } from "@/entities/user/index.server";
import type { PublicUser } from "@/shared/api";

type JournalScreenProps = {
  student: PublicUser;
  /** Время сервера на момент рендера — старт живых часов. */
  nowMs?: number;
  /** Подмена зависимостей ленты (тесты). */
  deps?: Partial<JournalDeps>;
};

/** Экран журнала для оператора-обучающегося: данные ленты грузит клиент через мок-слой /api/mock. */
export function JournalScreen({ student, nowMs, deps }: JournalScreenProps) {
  return <IncidentJournal student={student} initialNowMs={nowMs} deps={deps} />;
}

/**
 * `/arm` — главный экран АРМ «Поиск происшествий» (spec/000-фронт/04-pages/01-arm-main.md).
 * Серверный компонент: оператор — пользователь сессии (гвард раздела — proxy + лэйаут); getSessionUser
 * читает cookie, поэтому рендер динамический и Date.now() — время запроса.
 */
export async function JournalPage() {
  const sessionUser = await getSessionUser();
  return sessionUser ? <JournalScreen student={sessionUser.user} nowMs={Date.now()} /> : null;
}
