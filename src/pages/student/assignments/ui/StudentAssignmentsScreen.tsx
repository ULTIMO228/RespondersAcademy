"use client";

import { useRouter } from "next/navigation";

import { isModeAvailable } from "@/entities/assignment";
import type { AssignmentView } from "@/entities/assignment";
import { useSessionUser, zonesOf } from "@/entities/user";
import { ApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PlatformButton,
  ServerRequiredState,
  Skeleton,
} from "@/shared/ui/platform";

import { studentAssignmentsApi } from "../api/assignmentsApi";
import type { StudentAssignmentsApi } from "../api/assignmentsApi";
import { useAssignments } from "../model/useAssignments";
import { AssignmentCard } from "./AssignmentCard";

import styles from "./StudentAssignments.module.css";

type StudentAssignmentsScreenProps = {
  api?: StudentAssignmentsApi;
};

/**
 * `/student/assignments` — задания и экзамены обучающегося. Режим 112: запуск ведёт на рабочее место
 * (`/arm/operator112`), режим ДДС — start здесь и переход на карточку; причина 409 остаётся на карточке задания.
 * Старые задания chain (режим выведен 20.10.2026) показываются только для просмотра — кнопки запуска у них нет.
 */
export function StudentAssignmentsScreen({ api = studentAssignmentsApi }: StudentAssignmentsScreenProps) {
  const router = useRouter();
  const { state, reload } = useAssignments(api);
  const user = useSessionUser();
  /* Без сессии на клиенте (тесты, предзагрузка) фильтра нет; запрет всё равно держит сервер. */
  const zones = user ? zonesOf(user) : null;
  const visibleItems =
    state.status !== "ready"
      ? []
      : zones
        ? state.items.filter((view) => isModeAvailable(view.assignment.trainingMode, zones))
        : state.items;

  const start = async (view: AssignmentView): Promise<string | null> => {
    const { assignment } = view;
    if (assignment.trainingMode === "operator112") {
      router.push(ROUTES.armOperator112ForAssignment(assignment.id));
      return null;
    }
    try {
      const started = await api.start(assignment.id);
      router.push(
        started.kind === "dds"
          ? ROUTES.armCard(started.attempt.cardId)
          : ROUTES.armOperator112ForAssignment(assignment.id),
      );
      return null;
    } catch (error) {
      if (error instanceof ApiError) return error.message;
      return "Не удалось запустить задание";
    }
  };

  return (
    <section aria-labelledby="student-assignments-title">
      <PageHeader
        title="Задания и экзамены"
        description="Тренировки и экзамены, назначенные преподавателем"
        actions={
          <PlatformButton onClick={() => void reload()} disabled={state.status === "loading"}>
            Обновить
          </PlatformButton>
        }
      />

      {state.status === "loading" ? <Skeleton label="Загрузка заданий…" lines={3} /> : null}
      {state.status === "serverRequired" ? <ServerRequiredState onRetry={() => void reload()} /> : null}
      {state.status === "error" ? <ErrorState message={state.message} onRetry={() => void reload()} /> : null}
      {state.status === "ready" && visibleItems.length === 0 ? (
        <EmptyState title="Заданий пока нет" text="Задание назначает преподаватель." />
      ) : null}
      {state.status === "ready" && visibleItems.length > 0 ? (
        <div className={styles.page__list}>
          {visibleItems.map((view) => (
            <AssignmentCard key={view.assignment.id} view={view} onStart={start} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
