"use client";

import { useRouter } from "next/navigation";

import { AssignmentWizard } from "@/features/assignment-create";
import type { AssignmentCreateApi, WizardInitial } from "@/features/assignment-create";
import { useSessionUser } from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { PageHeader } from "@/shared/ui/platform";

type TeacherAssignmentNewScreenProps = {
  api?: AssignmentCreateApi;
  initial?: WizardInitial;
  focusStage?: string;
};

/** `/teacher/assignments/new` — мастер назначения; после создания открывается страница задания. */
export function TeacherAssignmentNewScreen({ api, initial, focusStage }: TeacherAssignmentNewScreenProps) {
  const router = useRouter();
  const user = useSessionUser();
  return (
    <section aria-labelledby="teacher-assignment-new-title">
      <PageHeader title="Новое назначение" description="Кому, что и на каких условиях отработать" />
      <AssignmentWizard
        api={api}
        assignedGroups={user?.assignedGroups}
        initial={initial}
        focusStage={focusStage}
        onCreated={(assignment) => router.push(ROUTES.teacherAssignment(assignment.id))}
        onCancel={() => router.push(ROUTES.teacherAssignments)}
      />
    </section>
  );
}
