import { assignmentPrefillFromQuery } from "@/features/assignment-create";
import type { AssignmentQuery } from "@/features/assignment-create";

import { TeacherAssignmentNewScreen } from "./TeacherAssignmentNewScreen";

type TeacherAssignmentNewPageProps = { searchParams?: Promise<AssignmentQuery> };

/**
 * `/teacher/assignments/new` — мастер назначения. Query из карты ошибок (спека 003, US2) задаёт начальные значения.
 * Ключ по разобранному query: переход на тот же маршрут с другими параметрами пересоздаёт мастер, иначе React
 * сохранил бы состояние прежнего черновика (см. guides/preserving-ui-state).
 */
export async function TeacherAssignmentNewPage({ searchParams }: TeacherAssignmentNewPageProps) {
  const { initial, focusStage } = assignmentPrefillFromQuery((await searchParams) ?? {});
  return (
    <TeacherAssignmentNewScreen
      key={JSON.stringify({ initial, focusStage })}
      initial={initial}
      focusStage={focusStage}
    />
  );
}
