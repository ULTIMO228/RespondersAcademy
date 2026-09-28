import { getSessionUser } from "@/entities/user/index.server";

import { ReportSessionScreen } from "./ReportSessionScreen";

type TeacherReportSessionPageProps = {
  params: Promise<{ sessionId: string }>;
};

/**
 * `/teacher/reports/[sessionId]` — отчёт о практическом занятии (spec/000-фронт/04-pages/13, п. 1–7).
 * Серверная обёртка: преподаватель — пользователь сессии (гвард — proxy + лэйаут), данные грузит клиент.
 */
export async function TeacherReportSessionPage({ params }: TeacherReportSessionPageProps) {
  const { sessionId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <ReportSessionScreen
      sessionId={sessionId}
      teacher={{ id: sessionUser.user.id, fullName: sessionUser.user.fullName }}
    />
  );
}
