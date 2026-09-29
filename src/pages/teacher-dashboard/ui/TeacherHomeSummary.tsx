"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useSessionUser } from "@/entities/user";
import type { Assignment, PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Card, EmptyState, ResourceView, Tag, useResource } from "@/shared/ui/platform";

import { teacherHomeApi } from "../api/homeApi";
import type { TeacherHomeApi } from "../api/homeApi";
import { PROFILE_CONCURRENCY, mapLimit, pickRiskZone, totalTypicalErrors } from "../lib/riskZone";
import type { RiskEntry } from "../lib/riskZone";

import styles from "./TeacherHomeSummary.module.css";

type Props = { api?: TeacherHomeApi };

type RiskResult = { entries: RiskEntry[]; failed: number };
type ChainTask = { assignment: Assignment; scenarioId: string; version: number; studentId: string };

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}

/**
 * Сводка на главной преподавателя (FR-070): зона риска, ближайшие сроки, задачи подтверждения. Блоки независимы: ошибка
 * или отсутствие сервера в одном не мешает остальным и не трогает мониторинг занятия ниже.
 */
export function TeacherHomeSummary({ api = teacherHomeApi }: Props) {
  const user = useSessionUser();
  const assignedGroups = user?.assignedGroups;

  const risk = useResource<RiskResult>(async () => {
    const all = await api.listStudents();
    const allowed = assignedGroups && assignedGroups.length > 0 ? new Set(assignedGroups) : null;
    const students = all.filter(
      (student: PublicUser) =>
        student.isActive && (!allowed || (student.group && allowed.has(student.group))),
    );
    const settled = await mapLimit(students, PROFILE_CONCURRENCY, (student) => api.profile(student.id));
    /* Без бэкенда все запросы профилей одинаково не проходят: это «нужен сервер», а не «профили не загрузились». */
    const failures = settled.filter((result) => result.status === "rejected");
    if (students.length > 0 && failures.length === students.length) throw failures[0].reason;
    const entries: RiskEntry[] = [];
    let failed = 0;
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        entries.push({ student: students[index], errors: totalTypicalErrors(result.value) });
      } else {
        failed += 1;
      }
    });
    return { entries, failed };
  }, [api, assignedGroups]);

  const assignments = useResource(() => api.listAssignments(), [api]);

  const chainTasks = useResource<ChainTask[]>(async () => {
    const list = await api.listAssignments();
    const chains = list.filter((item) => item.trainingMode === "chain" && item.state === "active");
    const settled = await mapLimit(chains, PROFILE_CONCURRENCY, (item) => api.assignmentDetail(item.id));
    const tasks: ChainTask[] = [];
    settled.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      for (const link of result.value.progress) {
        if (link.chainReview?.approval === "pending_review") {
          tasks.push({
            assignment: chains[index],
            scenarioId: link.chainReview.scenarioId,
            version: link.chainReview.version,
            studentId: link.studentId,
          });
        }
      }
    });
    return tasks;
  }, [api]);

  const deadlines = useMemo(() => {
    if (assignments.state.status !== "ready") return [];
    return assignments.state.data
      .filter((item) => item.state === "active" && item.dueAt)
      .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))
      .slice(0, 5);
  }, [assignments.state]);

  return (
    <div className={styles.summary}>
      <Card title="Зона риска" aria-label="Зона риска">
        <ResourceView state={risk.state} onRetry={risk.reload} skeletonLines={3}>
          {({ entries, failed }) => {
            const zone = pickRiskZone(entries);
            return (
              <>
                {zone.length === 0 ? (
                  <EmptyState title="Групп риска нет" text="Типичных ошибок у обучающихся пока нет." />
                ) : (
                  <ol className={styles.list}>
                    {zone.map(({ student, errors }) => (
                      <li key={student.id} className={styles.list__item}>
                        <Link href={ROUTES.teacherStudent(student.id)}>{student.fullName}</Link>
                        <Tag tone="danger">ошибок: {errors}</Tag>
                      </li>
                    ))}
                  </ol>
                )}
                {failed > 0 ? (
                  <p className={styles.note} role="status">
                    Профили {failed} обучающихся не загрузились — список неполный.
                  </p>
                ) : null}
              </>
            );
          }}
        </ResourceView>
      </Card>

      <Card title="Ближайшие сроки" aria-label="Ближайшие сроки">
        <ResourceView state={assignments.state} onRetry={assignments.reload} skeletonLines={3}>
          {() =>
            deadlines.length === 0 ? (
              <EmptyState title="Сроков нет" text="У активных назначений не указан срок." />
            ) : (
              <ul className={styles.list}>
                {deadlines.map((item) => (
                  <li key={item.id} className={styles.list__item}>
                    <Link href={ROUTES.teacherAssignment(item.id)}>{item.title || item.id}</Link>
                    <Tag tone={new Date(item.dueAt as string) < new Date() ? "danger" : "neutral"}>
                      до {formatDue(item.dueAt as string)}
                    </Tag>
                  </li>
                ))}
              </ul>
            )
          }
        </ResourceView>
      </Card>

      <Card title="Задачи подтверждения" aria-label="Задачи подтверждения">
        <ResourceView state={chainTasks.state} onRetry={chainTasks.reload} skeletonLines={3}>
          {(tasks) =>
            tasks.length === 0 ? (
              <EmptyState
                title="Подтверждать нечего"
                text="Входы ДДС цепочек, ожидающие проверки, появятся здесь."
              />
            ) : (
              <ul className={styles.list}>
                {tasks.map((task) => (
                  <li
                    key={`${task.assignment.id}-${task.scenarioId}-${task.version}-${task.studentId}`}
                    className={styles.list__item}
                  >
                    <Link href={ROUTES.teacherScenario(task.scenarioId)}>
                      Вход ДДС {task.scenarioId}, версия {task.version}
                    </Link>
                    <span className={styles.muted}>{task.assignment.title || task.assignment.id}</span>
                  </li>
                ))}
              </ul>
            )
          }
        </ResourceView>
      </Card>
    </div>
  );
}
