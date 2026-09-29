"use client";

import { useMemo } from "react";

import type { PublicUser } from "@/shared/api";
import { Alert, EmptyState, ErrorState, Skeleton, ServerRequiredState } from "@/shared/ui/platform";
import { useResource } from "@/shared/ui/platform";

import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import type { StepErrors } from "../model/types";
import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StepStudentsProps = {
  api: AssignmentCreateApi;
  /** Закреплённые за преподавателем группы: если заданы, показываются только они. */
  assignedGroups?: string[];
  selected: string[];
  errors: StepErrors;
  onChange: (studentIds: string[]) => void;
  /** Загруженный состав — мастер показывает имена на шаге проверки. */
  onLoaded: (students: PublicUser[]) => void;
};

const NO_GROUP = "Без группы";

export function StepStudents({
  api,
  assignedGroups,
  selected,
  errors,
  onChange,
  onLoaded,
}: StepStudentsProps) {
  const { state, reload } = useResource(async () => {
    const students = await api.listStudents();
    onLoaded(students);
    return students;
  }, [api]);

  const groups = useMemo(() => {
    if (state.status !== "ready") return [];
    const allowed = assignedGroups && assignedGroups.length > 0 ? new Set(assignedGroups) : null;
    const byGroup = new Map<string, PublicUser[]>();
    for (const user of state.data) {
      if (!user.isActive || user.role !== "student") continue;
      const group = user.group ?? NO_GROUP;
      if (allowed && !allowed.has(group)) continue;
      byGroup.set(group, [...(byGroup.get(group) ?? []), user]);
    }
    return [...byGroup.entries()].sort(([left], [right]) => left.localeCompare(right, "ru"));
  }, [state, assignedGroups]);

  if (state.status === "loading") return <Skeleton label="Загрузка обучающихся…" lines={3} />;
  if (state.status === "serverRequired") return <ServerRequiredState onRetry={reload} />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Нет доступных обучающихся"
        text="Назначать можно только активных обучающихся закреплённых за вами групп."
      />
    );
  }

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((item) => item !== id));
  const toggleGroup = (members: PublicUser[], checked: boolean) => {
    const ids = new Set(members.map((member) => member.id));
    const rest = selected.filter((id) => !ids.has(id));
    onChange(checked ? [...rest, ...ids] : rest);
  };

  return (
    <div className={styles.step}>
      {errors.studentIds ? (
        <Alert tone="danger" role="alert">
          {errors.studentIds}
        </Alert>
      ) : null}
      {groups.map(([group, members]) => (
        <fieldset key={group} className={styles.group}>
          <legend className={styles.group__title}>{group}</legend>
          <CheckRow
            checked={members.every((member) => selected.includes(member.id))}
            onChange={(checked) => toggleGroup(members, checked)}
          >
            <strong>Вся группа ({members.length})</strong>
          </CheckRow>
          {members.map((member) => (
            <CheckRow
              key={member.id}
              checked={selected.includes(member.id)}
              onChange={(checked) => toggle(member.id, checked)}
            >
              {member.fullName}
              <span className={styles.check__meta}> · {member.service ?? `АРМ ${member.armNumber}`}</span>
            </CheckRow>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
