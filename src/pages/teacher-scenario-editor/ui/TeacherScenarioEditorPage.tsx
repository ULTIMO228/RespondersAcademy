import { formatShortName } from "@/entities/user";
import { getSessionUser } from "@/entities/user/index.server";

import { buildEditorContext } from "../lib/buildEditorData";
import { ScenarioEditorScreen } from "./ScenarioEditorScreen";

type TeacherScenarioEditorPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * `/teacher/scenarios/[id]` — редактор и валидация сценария (spec/04-pages/11, п. 1–7).
 * Серверный компонент: преподаватель — пользователь сессии, здесь же готовится статический контекст
 * (учебные карточки, дерево ЕКП, фикстуры ПОВ-112); сам сценарий экран грузит из мок-API.
 */
export async function TeacherScenarioEditorPage({ params }: TeacherScenarioEditorPageProps) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <ScenarioEditorScreen
      scenarioId={id}
      teacherId={sessionUser.user.id}
      reviewerName={formatShortName(sessionUser.user.fullName)}
      context={buildEditorContext()}
    />
  );
}
