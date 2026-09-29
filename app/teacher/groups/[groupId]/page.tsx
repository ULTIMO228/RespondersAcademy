import type { Metadata } from "next";

import { TeacherGroupScreen } from "@/pages/teacher/groups";

export const metadata: Metadata = {
  title: "Группа",
};

type PageProps = { params: Promise<{ groupId: string }> };

export default async function TeacherGroupPage({ params }: PageProps) {
  const { groupId } = await params;
  return <TeacherGroupScreen groupId={decodeURIComponent(groupId)} />;
}
