"use client";

import { EmptyState, PageHeader, PlatformButton, ResourceView } from "@/shared/ui/platform";

import { studentScenariosApi } from "../api/scenariosApi";
import type { StudentScenariosApi } from "../api/scenariosApi";
import { useScenarioList } from "../model/useScenarioList";
import { ScenarioCard } from "./ScenarioCard";

import styles from "./StudentScenarios.module.css";

type StudentScenariosScreenProps = { api?: StudentScenariosApi };

/** `/student/scenarios` — сценарии с графом, назначенные преподавателем. */
export function StudentScenariosScreen({ api = studentScenariosApi }: StudentScenariosScreenProps) {
  const { state, reload } = useScenarioList(api);
  return (
    <section aria-label="Список сценариев">
      <PageHeader
        title="Сценарии"
        description="Сценарии приёма вызова, назначенные преподавателем"
        actions={
          <PlatformButton onClick={reload} disabled={state.status === "loading"}>
            Обновить
          </PlatformButton>
        }
      />
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить сценарии">
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title="Сценариев пока нет"
              text="Сценарий появится здесь, когда преподаватель назначит его в задании."
            />
          ) : (
            <div className={styles.list}>
              {items.map((item) => (
                <ScenarioCard key={`${item.assignmentId}:${item.scenarioId}:${item.version}`} item={item} />
              ))}
            </div>
          )
        }
      </ResourceView>
    </section>
  );
}
