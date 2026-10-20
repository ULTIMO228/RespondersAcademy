import { StudentScenarioRunScreen } from "./StudentScenarioRunScreen";

type StudentScenarioRunPageProps = {
  params: Promise<{ scenarioId: string; version: string }>;
};

/** Маршрутная обёртка: разбирает сегменты пути (id сценария, номер версии). */
export async function StudentScenarioRunPage({ params }: StudentScenarioRunPageProps) {
  const { scenarioId, version } = await params;
  return <StudentScenarioRunScreen scenarioId={decodeURIComponent(scenarioId)} version={Number(version)} />;
}
