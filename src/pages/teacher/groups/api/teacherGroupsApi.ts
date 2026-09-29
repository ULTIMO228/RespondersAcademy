/* Зависимости страницы «Группа»: инсайты и задания преподавателя для фильтра по заданию. */
import { getGroupInsights, listAssignments } from "@/shared/api";
import type { Assignment, GroupInsights } from "@/shared/api";

export type TeacherGroupsApi = {
  insights: (groupId: string, assignmentId?: string) => Promise<GroupInsights>;
  listAssignments: () => Promise<Assignment[]>;
};

export const teacherGroupsApi: TeacherGroupsApi = {
  insights: (groupId, assignmentId) => getGroupInsights(groupId, assignmentId),
  listAssignments: () => listAssignments(),
};
