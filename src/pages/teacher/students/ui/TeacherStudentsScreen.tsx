"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSessionUser } from "@/entities/user";
import type { PublicUser, Specialization } from "@/shared/api";
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
const SPECIALIZATIONS: { value: Specialization; title: string }[] = [
  { value: "operator112", title: "Специалист 112" },
  { value: "dds", title: "Оператор ДДС" },
];

function SpecializationEditor({
  student,
  onSave,
}: {
  student: PublicUser;
  onSave: (values: Specialization[]) => Promise<void>;
}) {
  const [values, setValues] = useState<Specialization[]>(student.specializations?.length ? student.specializations : ["dds"]);
  const [isSaving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const toggle = (value: Specialization, checked: boolean) => {
    setValues((current) => {
      const next = checked ? [...current, value] : current.filter((item) => item !== value);
      return SPECIALIZATIONS.map((item) => item.value).filter((item) => next.includes(item));
    });
    setMessage(null);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(values);
      setMessage("Специализация сохранена");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить специализацию");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.specialization}>
      <fieldset disabled={isSaving} aria-label={`Специализация: ${student.fullName}`}>
        <legend>Специализация</legend>
        {SPECIALIZATIONS.map(({ value, title }) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={(event) => toggle(value, event.currentTarget.checked)}
            />
            {title}
          </label>
        ))}
      </fieldset>
      <PlatformButton variant="secondary" disabled={isSaving || values.length === 0} onClick={() => void save()}>
        Сохранить
      </PlatformButton>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}

/** Обучающиеся преподавателя по группам; группы — из `assignedGroups` профиля, без них групп нет. */
export function groupStudents(students: PublicUser[], assignedGroups?: string[]): [string, PublicUser[]][] {
  const allowed = new Set(assignedGroups ?? []);
  const byGroup = new Map<string, PublicUser[]>();
  for (const student of students) {
    if (student.role !== "student") continue;
    const group = student.group ?? NO_GROUP;
    if (!allowed.has(group)) continue;
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
  const hasAssignedGroups = (assignedGroups?.length ?? 0) > 0;
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
              title={hasAssignedGroups ? "Обучающихся нет" : "Нет закреплённых групп"}
              text={
                hasAssignedGroups
                  ? "В закреплённых за вами группах нет обучающихся."
                  : "За вами не закреплено ни одной группы. Обратитесь к администратору."
              }
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
                        <SpecializationEditor
                          student={student}
                          onSave={async (specializations) => {
                            await api.setSpecializations(student.id, specializations);
                            await reload();
                          }}
                        />
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
