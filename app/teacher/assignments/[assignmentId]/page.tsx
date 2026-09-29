import type { Metadata } from "next";

import { TeacherAssignmentDetailScreen } from "@/pages/teacher/assignments";

export const metadata: Metadata = {
  title: "Назначение",
};

type PageProps = { params: Promise<{ assignmentId: string }> };

export default async function TeacherAssignmentPage({ params }: PageProps) {
  const { assignmentId } = await params;
  return <TeacherAssignmentDetailScreen assignmentId={assignmentId} />;
}
