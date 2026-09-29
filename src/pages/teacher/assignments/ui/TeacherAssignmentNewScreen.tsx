"use client";

import { useRouter } from "next/navigation";

import { AssignmentWizard } from "@/features/assignment-create";
import type { AssignmentCreateApi } from "@/features/assignment-create";
import { useSessionUser } from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { PageHeader } from "@/shared/ui/platform";

type TeacherAssignmentNewScreenProps = { api?: AssignmentCreateApi };

/** `/teacher/assignments/new` — мастер назначения; после создания открывается страница задания. */
export function TeacherAssignmentNewScreen({ api }: TeacherAssignmentNewScreenProps) {
  const router = useRouter();
  const user = useSessionUser();
  return (
    <section aria-labelledby="teacher-assignment-new-title">
      <PageHeader title="Новое назначение" description="Кому, что и на каких условиях отработать" />
      <AssignmentWizard
        api={api}
        assignedGroups={user?.assignedGroups}
        onCreated={(assignment) => router.push(ROUTES.teacherAssignment(assignment.id))}
        onCancel={() => router.push(ROUTES.teacherAssignments)}
      />
    </section>
  );
}
