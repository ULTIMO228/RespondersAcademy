import type { Metadata } from "next";

import { JournalScreen } from "@/pages/teacher/error-map";

export const metadata: Metadata = {
  title: "Журнал группы",
};

type PageProps = { params: Promise<{ groupId: string }> };

export default async function TeacherErrorMapJournalPage({ params }: PageProps) {
  const { groupId } = await params;
  return <JournalScreen groupId={decodeURIComponent(groupId)} />;
}
