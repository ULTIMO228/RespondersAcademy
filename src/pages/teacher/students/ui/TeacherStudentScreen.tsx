"use client";

import Link from "next/link";

import type {
  ErrorMapResponse,
  LobbyMode,
  StudentProfile,
  StudentStats,
  StudentStatsAttempt,
  StudentStatsSummary,
  TypicalError,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatMinutes, formatScore, formatSeconds, formatShare } from "@/shared/lib";
import {
  Card,
  DataTable,
  LinkButton,
  NormChart,
  PageHeader,
  ResourceView,
  StatGroup,
  StatTile,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn, StatTone } from "@/shared/ui/platform";

import { teacherStudentsApi } from "../api/teacherStudentsApi";
import type { TeacherStudentsApi } from "../api/teacherStudentsApi";

import styles from "./TeacherStudents.module.css";

const MODE_LABELS: Record<LobbyMode, string> = { dds: "Режим ДДС", operator112: "Режим 112" };
const MODES = Object.keys(MODE_LABELS) as LobbyMode[];
const ERROR_COLUMNS: DataColumn<TypicalError>[] = [
  { key: "type", title: "Тип ошибки", render: (row) => row.type },
  { key: "count", title: "Раз", numeric: true, render: (row) => row.count },
];
const MAX_WEAK_STAGES = 3;
const LEVEL_LABELS = { often: "часто", sometimes: "иногда" } as const;

type WeakStage = { mode: LobbyMode; title: string; share: number; level: "often" | "sometimes" };
type Loaded = { profile: StudentProfile; name: string; stats: StudentStats | null; weak: WeakStage[] | null };
type TeacherStudentScreenProps = {
  studentId: string;
  /** Адрес рейтинга, откуда пришёл преподаватель (спека 006): кнопка «Назад к рейтингу» ведёт туда. */
  from?: string;
  api?: TeacherStudentsApi;
};

/** Принимается только путь рейтинга: иначе параметр `from` стал бы открытым редиректом. */
function ratingReturn(from: string | undefined): string | null {
  return from && (from === ROUTES.teacherRating || from.startsWith(`${ROUTES.teacherRating}?`)) ? from : null;
}

/** До трёх этапов с уровнем «часто»/«иногда» из карт ошибок обоих режимов, по убыванию доли (FR-007). */
function weakStages(maps: (readonly [LobbyMode, ErrorMapResponse])[]): WeakStage[] {
  const found: WeakStage[] = [];
  for (const [mode, map] of maps) {
    const titles = new Map(map.stages.map((stage) => [stage.id, stage.title]));
    for (const level of map.levels) {
      if ((level.level === "often" || level.level === "sometimes") && level.share !== null) {
        found.push({
          mode,
          title: titles.get(level.stageId) ?? level.stageId,
          share: level.share,
          level: level.level,
        });
      }
    }
  }
  return found.sort((a, b) => b.share - a.share).slice(0, MAX_WEAK_STAGES);
}

/** Дополнительный блок профиля: его сбой не роняет страницу — блок пишет «недоступно». */
async function optional<T>(load: (() => Promise<T>) | null): Promise<T | null> {
  if (!load) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}

function speedTone(value: number | null, limit: number): StatTone {
  return value !== null && value > limit ? "bad" : "default";
}

/** `/teacher/students/[id]` — полный профиль обучающегося: рейтинги, скорость, динамика, слабые этапы, ошибки, попытки. */
export function TeacherStudentScreen({
  studentId,
  from,
  api = teacherStudentsApi,
}: TeacherStudentScreenProps) {
  const back = ratingReturn(from);
  const { state, reload } = useResource<Loaded>(async () => {
    // Права проверяет профиль (чужому преподавателю — 403): его ошибка показывается целиком.
    const { stats, errorMap } = api;
    const [profile, students, loadedStats, maps] = await Promise.all([
      api.profile(studentId),
      api.listStudents().catch(() => []),
      optional(stats ? () => stats(studentId) : null),
      optional(
        errorMap
          ? () => Promise.all(MODES.map(async (mode) => [mode, await errorMap(studentId, mode)] as const))
          : null,
      ),
    ]);
    const name =
      loadedStats?.fullName ?? students.find((item) => item.id === studentId)?.fullName ?? studentId;
    return { profile, name, stats: loadedStats, weak: maps ? weakStages(maps) : null };
  }, [api, studentId]);
  return (
    <section aria-labelledby="teacher-student-title">
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось открыть профиль обучающегося">
        {({ profile, name, stats, weak }) => (
          <>
            <PageHeader
              title={name}
              description="Полная статистика обучающегося по всем попыткам"
              actions={
                <>
                  <LinkButton
                    variant="primary"
                    href={ROUTES.teacherAssignmentNewPrefilled({ studentIds: [studentId] })}
                  >
                    Назначить тренировку
                  </LinkButton>
                  <LinkButton href={ROUTES.teacherErrorMapStudent(studentId)}>Карта ошибок</LinkButton>
                  {back ? (
                    <LinkButton href={back}>Назад к рейтингу</LinkButton>
                  ) : (
                    <LinkButton href={ROUTES.teacherStudents}>К списку</LinkButton>
                  )}
                </>
              }
            />
            <h2 className={styles.section}>Баллы и рейтинг</h2>
            <StatGroup>
              {MODES.map((mode) => (
                <StatTile
                  key={mode}
                  label={`Рейтинг: ${MODE_LABELS[mode]}`}
                  value={Math.round(profile.ratings[mode] ?? 0)}
                  note={profile.strongerMode === mode ? "сильный режим" : undefined}
                  tone={profile.strongerMode === mode ? "good" : "default"}
                />
              ))}
              {stats ? (
                <StatTile
                  label="Средний балл"
                  value={formatScore(stats.summary.averageScore)}
                  note={`попыток: ${stats.summary.attempts}`}
                />
              ) : null}
            </StatGroup>
            <p className={styles.muted}>
              {profile.strongerMode
                ? `Сильный режим: ${MODE_LABELS[profile.strongerMode]}.`
                : "Рейтинги режимов равны — сильный режим не выделен."}
            </p>
            {stats ? <StatsBlocks stats={stats} /> : null}
            <Card title="Слабые этапы">
              {weak === null ? (
                <p className={styles.muted}>Карта ошибок недоступна.</p>
              ) : weak.length === 0 ? (
                <p className={styles.muted}>Этапов, где ошибки повторяются, нет (или мало попыток).</p>
              ) : (
                <ul className={styles.list}>
                  {weak.map((item) => (
                    <li key={`${item.mode}-${item.title}`} className={styles.list__item}>
                      {item.title} · {MODE_LABELS[item.mode]}
                      <Tag tone={item.level === "often" ? "danger" : "warning"}>
                        {LEVEL_LABELS[item.level]}: {Math.round(item.share * 100)} % попыток с ошибкой
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className={styles.columns}>
              {MODES.map((mode) => (
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
            {stats ? <AttemptsCard stats={stats} /> : null}
          </>
        )}
      </ResourceView>
    </section>
  );
}

function SpeedTiles({ summary, stats }: { summary: StudentStatsSummary; stats: StudentStats }) {
  return (
    <StatGroup>
      <StatTile
        label="Средняя реакция"
        value={formatSeconds(summary.averageReactionMs)}
        note={`норматив ${formatSeconds(stats.norms.reactionMs)}`}
        tone={speedTone(summary.averageReactionMs, stats.norms.reactionMs)}
      />
      <StatTile
        label="Средняя отработка"
        value={formatMinutes(summary.averageProcessingMs)}
        note={`норматив ${formatMinutes(stats.norms.processingMs)}`}
        tone={speedTone(summary.averageProcessingMs, stats.norms.processingMs)}
      />
      <StatTile label="В нормативе" value={formatShare(summary.withinNormsShare)} note="доля попыток" />
    </StatGroup>
  );
}

function StatsBlocks({ stats }: { stats: StudentStats }) {
  const points = stats.dynamics;
  const labels = points.map((point) => point.at.slice(0, 10));
  return (
    <>
      <h2 className={styles.section}>Скорость</h2>
      <SpeedTiles summary={stats.summary} stats={stats} />
      <div className={styles.columns}>
        {MODES.map((mode) => (
          <Card key={mode} title={`Скорость: ${MODE_LABELS[mode]}`}>
            {stats.byMode[mode].attempts === 0 ? (
              <p className={styles.muted}>Попыток в этом режиме нет.</p>
            ) : (
              <SpeedTiles summary={stats.byMode[mode]} stats={stats} />
            )}
          </Card>
        ))}
      </div>
      <h2 className={styles.section}>Динамика</h2>
      {points.length === 0 ? (
        <p className={styles.muted}>Завершённых попыток пока нет.</p>
      ) : (
        <div className={styles.columns}>
          <Card title="Балл по попыткам">
            <NormChart
              title="Балл по попыткам"
              labels={labels}
              values={points.map((point) => point.score)}
              seriesName="Балл"
            />
          </Card>
          <Card title="Время реакции по попыткам">
            <NormChart
              title="Время реакции по попыткам"
              labels={labels}
              values={points.map((point) => Math.round(point.reactionMs / 1000))}
              seriesName="Реакция"
              unit="с"
              tone="reaction"
              norm={{ value: stats.norms.reactionMs / 1000, label: "Норматив 30 с" }}
            />
          </Card>
        </div>
      )}
    </>
  );
}

const ATTEMPT_COLUMNS: DataColumn<StudentStatsAttempt>[] = [
  { key: "at", title: "Дата", render: (row) => row.at.slice(0, 16).replace("T", " ") },
  { key: "title", title: "Билет", render: (row) => row.title },
  { key: "mode", title: "Режим", render: (row) => MODE_LABELS[row.mode] },
  { key: "format", title: "Формат", render: (row) => (row.format === "exam" ? "Экзамен" : "Тренировка") },
  { key: "score", title: "Балл", numeric: true, render: (row) => formatScore(row.score) },
  {
    key: "reaction",
    title: "Реакция",
    numeric: true,
    render: (row) => (row.reactionMs ? formatSeconds(row.reactionMs) : "—"),
  },
  {
    key: "processing",
    title: "Отработка",
    numeric: true,
    render: (row) => (row.processingMs ? formatMinutes(row.processingMs) : "—"),
  },
  {
    key: "report",
    title: "Разбор",
    render: (row) =>
      row.sessionId ? <Link href={ROUTES.teacherReport(row.sessionId)}>Отчёт занятия</Link> : "—",
  },
];

function AttemptsCard({ stats }: { stats: StudentStats }) {
  return (
    <Card title="Попытки">
      <DataTable
        caption="Завершённые попытки, новые сверху"
        columns={ATTEMPT_COLUMNS}
        rows={stats.attempts}
        getRowKey={(row) => row.attemptId}
        emptyText="Завершённых попыток пока нет."
      />
    </Card>
  );
}
