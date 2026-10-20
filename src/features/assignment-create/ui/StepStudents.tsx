"use client";

import { useMemo } from "react";

import { singleSpecialization, SPECIALIZATION_SHORT, SPECIALIZATION_TITLES } from "@/entities/user";
import type { PublicUser, TrainingMode } from "@/shared/api";
import { Alert, EmptyState, ErrorState, Skeleton, ServerRequiredState, Tag } from "@/shared/ui/platform";
import { useResource } from "@/shared/ui/platform";

import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import { NO_GROUP, assignableStudents } from "../model/students";
import type { StepErrors } from "../model/types";
import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StepStudentsProps = {
  api: AssignmentCreateApi;
  /** Закреплённые за преподавателем группы: если заданы, показываются только они. */
  assignedGroups?: string[];
  trainingMode: TrainingMode;
  selected: string[];
  errors: StepErrors;
  onChange: (studentIds: string[]) => void;
  /** Загруженный состав — мастер показывает имена на шаге проверки. */
  onLoaded: (students: PublicUser[]) => void;
};

export function StepStudents({
  api,
  assignedGroups,
  trainingMode,
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
    const byGroup = new Map<string, PublicUser[]>();
    for (const user of assignableStudents(state.data, assignedGroups, trainingMode)) {
      const group = user.group ?? NO_GROUP;
      byGroup.set(group, [...(byGroup.get(group) ?? []), user]);
    }
    return [...byGroup.entries()].sort(([left], [right]) => left.localeCompare(right, "ru"));
  }, [state, assignedGroups, trainingMode]);

  if (state.status === "loading") return <Skeleton label="Загрузка обучающихся…" lines={3} />;
  if (state.status === "serverRequired") return <ServerRequiredState onRetry={reload} />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Нет доступных обучающихся"
        text="В выбранном режиме нет активных обучающихся с нужной специализацией в закреплённых за вами группах."
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
          {members.map((member) => {
            // Метка профиля spec/008: у обучающегося с одной специализацией — «112» или «ДДС» рядом с ФИО.
            const only = singleSpecialization(member);
            return (
              <CheckRow
                key={member.id}
                checked={selected.includes(member.id)}
                onChange={(checked) => toggle(member.id, checked)}
              >
                {member.fullName}
                {only ? (
                  <>
                    {" "}
                    <span title={`Профиль: ${SPECIALIZATION_TITLES[only]}`}>
                      <Tag tone="info">{SPECIALIZATION_SHORT[only]}</Tag>
                    </span>
                  </>
                ) : null}
                <span className={styles.check__meta}> · {member.service ?? `АРМ ${member.armNumber}`}</span>
              </CheckRow>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
