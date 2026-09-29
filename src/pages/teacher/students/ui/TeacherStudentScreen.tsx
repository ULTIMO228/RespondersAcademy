"use client";

import type { LobbyMode, StudentProfile, TypicalError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Card,
  DataTable,
  LinkButton,
  PageHeader,
  ResourceView,
  StatGroup,
  StatTile,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { teacherStudentsApi } from "../api/teacherStudentsApi";
import type { TeacherStudentsApi } from "../api/teacherStudentsApi";

import styles from "./TeacherStudents.module.css";

const MODE_LABELS: Record<LobbyMode, string> = { dds: "Режим ДДС", operator112: "Режим 112" };
const ERROR_COLUMNS: DataColumn<TypicalError>[] = [
  { key: "type", title: "Тип ошибки", render: (row) => row.type },
  { key: "count", title: "Раз", numeric: true, render: (row) => row.count },
];

type Loaded = { profile: StudentProfile; name: string };
type TeacherStudentScreenProps = { studentId: string; api?: TeacherStudentsApi };

/** `/teacher/students/[id]` — профиль обучающегося: рейтинги режимов, сильный режим, типичные ошибки, рекомендации. */
export function TeacherStudentScreen({ studentId, api = teacherStudentsApi }: TeacherStudentScreenProps) {
  const { state, reload } = useResource<Loaded>(async () => {
    const [profile, students] = await Promise.all([
      api.profile(studentId),
      api.listStudents().catch(() => []),
    ]);
    return { profile, name: students.find((item) => item.id === studentId)?.fullName ?? studentId };
  }, [api, studentId]);
  return (
    <section aria-labelledby="teacher-student-title">
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить профиль обучающегося">
        {({ profile, name }) => (
          <>
            <PageHeader
              title={name}
              description="Профиль обучающегося по итогам всех попыток"
              actions={<LinkButton href={ROUTES.teacherStudents}>К списку</LinkButton>}
            />
            <StatGroup>
              {(Object.keys(MODE_LABELS) as LobbyMode[]).map((mode) => (
                <StatTile
                  key={mode}
                  label={`Рейтинг: ${MODE_LABELS[mode]}`}
                  value={Math.round(profile.ratings[mode] ?? 0)}
                  note={profile.strongerMode === mode ? "сильный режим" : undefined}
                  tone={profile.strongerMode === mode ? "good" : "default"}
                />
              ))}
            </StatGroup>
            <p className={styles.muted}>
              {profile.strongerMode
                ? `Сильный режим: ${MODE_LABELS[profile.strongerMode]}.`
                : "Рейтинги режимов равны — сильный режим не выделен."}
            </p>
            <div className={styles.columns}>
              {(Object.keys(MODE_LABELS) as LobbyMode[]).map((mode) => (
                <Card key={mode} title={`Типичные ошибки: ${MODE_LABELS[mode]}`}>
                  <DataTable
                    caption={`Типичные ошибки, ${MODE_LABELS[mode]}`}
                    columns={ERROR_COLUMNS}
                    rows={profile.typicalErrors[mode] ?? []}
                    getRowKey={(row) => row.type}
                    emptyText="Ошибок в этом режиме пока нет."
                  />
                </Card>
              ))}
            </div>
            <Card title="Рекомендации системы">
              {profile.recommendations.length === 0 ? (
                <p className={styles.muted}>Рекомендаций нет: не хватает истории попыток.</p>
              ) : (
                <ul className={styles.list}>
                  {profile.recommendations.map((item) => (
                    <li key={item.id} className={styles.list__item}>
                      {item.title}
                      <Tag tone={item.acceptedAt ? "success" : "neutral"}>
                        {item.acceptedAt ? "принята" : `${item.reason.errorType} × ${item.reason.count}`}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </ResourceView>
    </section>
  );
}
