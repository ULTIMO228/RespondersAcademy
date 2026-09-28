import { requireSessionUser } from "@/entities/user/index.server";

import { MonitorScreen } from "./MonitorScreen";

type TeacherMonitorPageProps = {
  params: Promise<{ studentId: string }>;
};

/**
 * `/teacher/monitor/[studentId]` — экран курсанта, только просмотр (spec/000-фронт/04-pages/10-teacher-dashboard.md).
 * Серверный компонент: преподаватель — пользователь сессии (гвард роли — proxy + лэйаут `app/teacher`).
 * Ограничение «только своё идущее занятие и его курсанты» проверяют экран (resolveAccess) и мок-слой.
 */
export async function TeacherMonitorPage({ params }: TeacherMonitorPageProps) {
  const { studentId } = await params;
  const { user } = await requireSessionUser("teacher");
  return <MonitorScreen teacherId={user.id} studentId={studentId} />;
}
