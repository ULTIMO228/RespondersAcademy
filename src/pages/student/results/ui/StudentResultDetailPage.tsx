import type { LobbyMode } from "@/shared/api";

import { StudentResultDetailScreen } from "./StudentResultDetailScreen";

type StudentResultDetailPageProps = {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `/student/results/[attemptId]?mode=operator112|dds` — разбор попытки; режим определяет источник оценки. */
export async function StudentResultDetailPage({ params, searchParams }: StudentResultDetailPageProps) {
  const [{ attemptId }, query] = await Promise.all([params, searchParams]);
  const rawMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const mode: LobbyMode = rawMode === "dds" ? "dds" : "operator112";
  return <StudentResultDetailScreen attemptId={decodeURIComponent(attemptId)} mode={mode} />;
}
