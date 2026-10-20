import type { Metadata } from "next";

import { TeacherStudentScreen } from "@/pages/teacher/students";

export const metadata: Metadata = {
  title: "Обучающийся",
};

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function TeacherStudentPage({ params, searchParams }: PageProps) {
  const { studentId } = await params;
  const { from } = await searchParams;
  return <TeacherStudentScreen studentId={studentId} from={Array.isArray(from) ? from[0] : from} />;
}
