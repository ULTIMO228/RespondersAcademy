"use client";

import { useCallback, useEffect, useState } from "react";

import { ServerRequiredError } from "@/shared/api";

import type { StudentAssignmentsApi } from "../api/assignmentsApi";
import { toView } from "@/entities/assignment";
import type { AssignmentView } from "@/entities/assignment";

export type ListState =
  | { status: "loading" }
  | { status: "serverRequired" }
  | { status: "error"; message: string }
  | { status: "ready"; items: AssignmentView[] };

/**
 * Список заданий обучающегося: сервер отдаёт только назначенные ему; для каждого читается деталь с прогрессом.
 * Ошибка чтения детали одной карточки не роняет страницу — карточка показывается без прогресса.
 * Чтение задания применяет истечение лимита экзамена на сервере, поэтому «Обновить» показывает актуальный итог.
 */
export function useAssignments(api: StudentAssignmentsApi) {
  const [state, setState] = useState<ListState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const assignments = await api.list();
      const details = await Promise.allSettled(assignments.map((item) => api.detail(item.id)));
      setState({
        status: "ready",
        items: assignments.map((assignment, index) => {
          const detail = details[index];
          return toView(assignment, detail.status === "fulfilled" ? detail.value : null);
        }),
      });
    } catch (error) {
      if (error instanceof ServerRequiredError) setState({ status: "serverRequired" });
      else {
        setState({
          status: "error",
          message: error instanceof Error && error.message ? error.message : "Не удалось загрузить задания",
        });
      }
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
