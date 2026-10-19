import type { Metadata } from "next";

import { ErrorMapScreen } from "@/pages/teacher/error-map";

export const metadata: Metadata = {
  title: "Карта ошибок группы",
};

type PageProps = { params: Promise<{ groupId: string }> };

export default async function TeacherErrorMapGroupPage({ params }: PageProps) {
  const { groupId } = await params;
  return <ErrorMapScreen groupId={decodeURIComponent(groupId)} />;
}
