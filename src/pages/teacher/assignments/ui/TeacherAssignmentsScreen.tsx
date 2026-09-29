"use client";

import Link from "next/link";
import { useState } from "react";

import { MODE_TITLES } from "@/entities/assignment";
import type { Assignment, AssignmentState } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Card,
  DataTable,
  LinkButton,
  PageHeader,
  PlatformButton,
  ResourceView,
  SegmentedControl,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { teacherAssignmentsApi } from "../api/teacherAssignmentsApi";
import type { TeacherAssignmentsApi } from "../api/teacherAssignmentsApi";
import { formatDate } from "../lib/format";

type Filter = "all" | AssignmentState;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "finished", label: "Завершённые" },
];

function ticketCount(assignment: Assignment): string {
  if (assignment.randomRule && assignment.cardIds.length === 0)
    return `случайно: ${assignment.randomRule.count}`;
  return String(assignment.cardIds.length);
}

const COLUMNS: DataColumn<Assignment>[] = [
  {
    key: "title",
    title: "Задание",
    render: (row) => <Link href={ROUTES.teacherAssignment(row.id)}>{row.title || `Задание ${row.id}`}</Link>,
  },
  { key: "mode", title: "Режим", render: (row) => MODE_TITLES[row.trainingMode] },
  {
    key: "format",
    title: "Формат",
    render: (row) =>
      row.format === "exam" ? <Tag tone="warning">Экзамен</Tag> : <Tag tone="info">Тренировка</Tag>,
  },
  { key: "students", title: "Обучающихся", numeric: true, render: (row) => row.studentIds.length },
  { key: "tickets", title: "Билетов", numeric: true, render: ticketCount },
  { key: "created", title: "Создано", render: (row) => formatDate(row.createdAt) },
  {
    key: "state",
    title: "Состояние",
    render: (row) => (row.state === "active" ? <Tag tone="success">Активно</Tag> : <Tag>Завершено</Tag>),
  },
];

type TeacherAssignmentsScreenProps = { api?: TeacherAssignmentsApi };

/** `/teacher/assignments` — задания преподавателя; сервер отдаёт только его собственные назначения. */
export function TeacherAssignmentsScreen({ api = teacherAssignmentsApi }: TeacherAssignmentsScreenProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const { state, reload } = useResource(() => api.list(), [api]);
  return (
    <section aria-labelledby="teacher-assignments-title">
      <PageHeader
        title="Назначения"
        description="Тренировки и экзамены, которые вы назначили обучающимся"
        actions={
          <>
            <PlatformButton variant="secondary" onClick={reload}>
              Обновить
            </PlatformButton>
            <LinkButton variant="primary" href={ROUTES.teacherAssignmentNew}>
              Новое назначение
            </LinkButton>
          </>
        }
      />
      <Card>
        <SegmentedControl label="Состояние заданий" options={FILTERS} value={filter} onChange={setFilter} />
        <ResourceView state={state} onRetry={reload}>
          {(items) => (
            <DataTable
              caption="Назначения"
              columns={COLUMNS}
              rows={items.filter((item) => filter === "all" || item.state === filter)}
              getRowKey={(row) => row.id}
              emptyText="Назначений нет. Создайте первое кнопкой «Новое назначение»."
            />
          )}
        </ResourceView>
      </Card>
    </section>
  );
}
