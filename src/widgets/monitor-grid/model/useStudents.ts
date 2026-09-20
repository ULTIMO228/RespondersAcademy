"use client";

import { useEffect, useState } from "react";

import type { MonitorStudent } from "./types";
import { useMonitorDeps } from "./deps";

const EMPTY: MonitorStudent[] = [];
const STUDENT_ROLE = "student";

/**
 * Курсанты занятия (GET /users?role=student — PublicUser без паролей). Список учёток из mocks/users.json
 * на клиент не попадает: имена и номера АРМ приходят из мок-API (T2.5-01).
 */
export function useStudents(studentIds: readonly string[]): MonitorStudent[] {
  const { api } = useMonitorDeps();
  const [students, setStudents] = useState<MonitorStudent[]>(EMPTY);
  const key = [...studentIds].sort().join(",");

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    const ids = new Set(key.split(","));
    api.listUsers({ role: STUDENT_ROLE }, controller.signal).then(
      (users) => {
        if (!controller.signal.aborted) setStudents(users.filter((user) => ids.has(user.id)));
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api, key]);

  return students;
}
