"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useSessionUser } from "@/entities/user";
import type { PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Card,
  EmptyState,
  PageHeader,
  PlatformButton,
  ResourceView,
  Tag,
  useResource,
} from "@/shared/ui/platform";

import { teacherStudentsApi } from "../api/teacherStudentsApi";
import type { TeacherStudentsApi } from "../api/teacherStudentsApi";

import styles from "./TeacherStudents.module.css";

const NO_GROUP = "Без группы";

/** Обучающиеся преподавателя по группам; группы — из `assignedGroups` профиля, без них показываются все. */
export function groupStudents(students: PublicUser[], assignedGroups?: string[]): [string, PublicUser[]][] {
  const allowed = assignedGroups && assignedGroups.length > 0 ? new Set(assignedGroups) : null;
  const byGroup = new Map<string, PublicUser[]>();
  for (const student of students) {
    if (student.role !== "student") continue;
    const group = student.group ?? NO_GROUP;
    if (allowed && !allowed.has(group)) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), student]);
  }
  return [...byGroup.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "ru"))
    .map(([group, members]) => [
      group,
      [...members].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    ]);
}

type TeacherStudentsScreenProps = { api?: TeacherStudentsApi };

export function TeacherStudentsScreen({ api = teacherStudentsApi }: TeacherStudentsScreenProps) {
  const user = useSessionUser();
  const assignedGroups = user?.assignedGroups;
  const { state, reload } = useResource(() => api.listStudents(), [api]);
  const groups = useMemo(
    () => (state.status === "ready" ? groupStudents(state.data, assignedGroups) : []),
    [state, assignedGroups],
  );
  return (
    <section aria-labelledby="teacher-students-title">
      <PageHeader
        title="Обучающиеся"
        description="Рейтинги, типичные ошибки и рекомендации по каждому обучающемуся"
        actions={
          <PlatformButton variant="secondary" onClick={reload}>
            Обновить
          </PlatformButton>
        }
      />
      <ResourceView state={state} onRetry={reload}>
        {() =>
          groups.length === 0 ? (
            <EmptyState
              title="Обучающихся нет"
              text="За вами не закреплено ни одной группы с обучающимися."
            />
          ) : (
            <div className={styles.groups}>
              {groups.map(([group, members]) => (
                <Card
                  key={group}
                  title={group}
                  actions={<Link href={ROUTES.teacherGroup(group)}>Аналитика группы</Link>}
                >
                  <ul className={styles.list}>
                    {members.map((student) => (
                      <li key={student.id} className={styles.list__item}>
                        <Link href={ROUTES.teacherStudent(student.id)}>{student.fullName}</Link>
                        {student.service ? <span className={styles.muted}>{student.service}</span> : null}
                        {student.isActive ? null : <Tag tone="warning">Заблокирован</Tag>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )
        }
      </ResourceView>
    </section>
  );
}
