import { formatShortName } from "@/entities/user";
import { requireSessionUser } from "@/entities/user/index.server";

import { DashboardScreen } from "./DashboardScreen";

/**
 * `/teacher` — дашборд класса (spec/04-pages/10-teacher-dashboard.md). Серверный компонент: преподаватель —
 * пользователь сессии (гвард — proxy + лэйаут роли), данные занятия клиент грузит из мок-API сам.
 */
export async function TeacherDashboardPage() {
  const { user } = await requireSessionUser("teacher");
  return <DashboardScreen teacherId={user.id} teacherName={formatShortName(user.fullName)} />;
}
