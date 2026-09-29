"use client";

import { useState } from "react";

import type { GroupInsight } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Card,
  DataTable,
  EmptyState,
  LinkButton,
  PageHeader,
  ResourceView,
  SelectField,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { teacherGroupsApi } from "../api/teacherGroupsApi";
import type { TeacherGroupsApi } from "../api/teacherGroupsApi";

const COLUMNS: DataColumn<GroupInsight>[] = [
  { key: "errorType", title: "Ошибка", render: (row) => row.errorType },
  { key: "share", title: "Доля группы", numeric: true, render: (row) => `${Math.round(row.share * 100)}%` },
  { key: "text", title: "Пояснение", render: (row) => row.text },
];

type TeacherGroupScreenProps = { groupId: string; api?: TeacherGroupsApi };

/** `/teacher/groups/[id]` — что группа делает не так и какую тему повторить; можно сузить до одного задания. */
export function TeacherGroupScreen({ groupId, api = teacherGroupsApi }: TeacherGroupScreenProps) {
  const [assignmentId, setAssignmentId] = useState("");
  const insights = useResource(
    () => api.insights(groupId, assignmentId || undefined),
    [api, groupId, assignmentId],
  );
  const assignments = useResource(() => api.listAssignments(), [api]);
  const own = assignments.state.status === "ready" ? assignments.state.data : [];
  return (
    <section aria-labelledby="teacher-group-title">
      <PageHeader
        title={`Группа ${groupId}`}
        description="Типичные ошибки группы и предлагаемая тема для повторения"
        actions={<LinkButton href={ROUTES.teacherStudents}>К обучающимся</LinkButton>}
      />
      <Card>
        <SelectField
          label="Задание"
          hint="По умолчанию — все попытки группы"
          value={assignmentId}
          onChange={(event) => setAssignmentId(event.target.value)}
        >
          <option value="">Все попытки</option>
          {own.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || item.id}
            </option>
          ))}
        </SelectField>
      </Card>
      <ResourceView state={insights.state} onRetry={insights.reload}>
        {(data) =>
          data.insights.length === 0 ? (
            <EmptyState title="Данных пока нет" text="У группы нет ошибок в завершённых попытках." />
          ) : (
            <>
              <Card title="Предлагаемая тема" accent>
                {data.suggestedGroup ? (
                  <p>
                    Повторить группу происшествий: <strong>{data.suggestedGroup}</strong>
                  </p>
                ) : (
                  <p>Тема не определена.</p>
                )}
              </Card>
              <Card title="Типичные ошибки группы">
                <DataTable
                  caption="Инсайты группы"
                  columns={COLUMNS}
                  rows={data.insights}
                  getRowKey={(row) => row.errorType}
                />
              </Card>
            </>
          )
        }
      </ResourceView>
    </section>
  );
}
