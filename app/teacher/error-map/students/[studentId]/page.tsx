import type { Metadata } from "next";

import { StudentMapScreen } from "@/pages/teacher/error-map";

export const metadata: Metadata = {
  title: "Карта ошибок обучающегося",
};

type PageProps = { params: Promise<{ studentId: string }> };

export default async function TeacherErrorMapStudentPage({ params }: PageProps) {
  const { studentId } = await params;
  return <StudentMapScreen studentId={decodeURIComponent(studentId)} />;
}
