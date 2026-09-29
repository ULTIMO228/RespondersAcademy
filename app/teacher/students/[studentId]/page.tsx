import type { Metadata } from "next";

import { TeacherStudentScreen } from "@/pages/teacher/students";

export const metadata: Metadata = {
  title: "Обучающийся",
};

type PageProps = { params: Promise<{ studentId: string }> };

export default async function TeacherStudentPage({ params }: PageProps) {
  const { studentId } = await params;
  return <TeacherStudentScreen studentId={studentId} />;
}
