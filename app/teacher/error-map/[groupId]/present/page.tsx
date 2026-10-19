import type { Metadata } from "next";

import { PresentScreen } from "@/pages/teacher/error-map";

export const metadata: Metadata = {
  title: "Показ карты ошибок",
};

type PageProps = { params: Promise<{ groupId: string }> };

export default async function TeacherErrorMapPresentPage({ params }: PageProps) {
  const { groupId } = await params;
  return <PresentScreen groupId={decodeURIComponent(groupId)} />;
}
