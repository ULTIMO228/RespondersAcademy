"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import type { RatingMode, RatingPeriod, StudentRatingResponse } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Card,
  EmptyState,
  PageHeader,
  ResourceView,
  SelectField,
  Skeleton,
  Tag,
  useResource,
} from "@/shared/ui/platform";

import { ratingApi } from "../api/ratingApi";
import type { RatingApi } from "../api/ratingApi";
import { formatMinutes, formatScore, formatSeconds, formatShare } from "@/shared/lib";
import { defaultDir, parseRatingQuery, rankRows, serializeRatingQuery } from "../model/rank";
import type { RankedRow, RatingFilters, SortKey } from "../model/rank";

import styles from "./TeacherRating.module.css";

const MODE_OPTIONS: { value: RatingMode; label: string }[] = [
  { value: "all", label: "Оба режима" },
  { value: "operator112", label: "Специалист-112" },
  { value: "dds", label: "ДДС" },
];
const PERIOD_OPTIONS: { value: RatingPeriod; label: string }[] = [
  { value: "all", label: "Весь период" },
  { value: "1m", label: "Месяц" },
  { value: "2w", label: "2 недели" },
];

type Column = {
  key: SortKey;
  title: string;
  render: (row: RankedRow, norms: StudentRatingResponse["norms"]) => ReactNode;
};

function OverNorm({ value, limit, text }: { value: number | null; limit: number; text: string }) {
  if (value === null || value <= limit) return <>{text}</>;
  // FR-005: выход за норматив — не только цветом: значок и подпись для скринридера.
  return (
    <span className={styles.over}>
      <span aria-hidden="true">⚠ </span>
      {text}
      <span className="visually-hidden"> — хуже норматива</span>
    </span>
  );
}

const COLUMNS: Column[] = [
  { key: "averageScore", title: "Средний балл", render: (row) => formatScore(row.averageScore) },
  { key: "ratingOperator112", title: "Рейтинг 112", render: (row) => row.ratingOperator112 },
  { key: "ratingDds", title: "Рейтинг ДДС", render: (row) => row.ratingDds },
  {
    key: "averageReactionMs",
    title: "Реакция",
    render: (row, norms) => (
      <OverNorm
        value={row.averageReactionMs}
        limit={norms.reactionMs}
        text={formatSeconds(row.averageReactionMs)}
      />
    ),
  },
  {
    key: "averageProcessingMs",
    title: "Отработка",
    render: (row, norms) => (
      <OverNorm
        value={row.averageProcessingMs}
        limit={norms.processingMs}
        text={formatMinutes(row.averageProcessingMs)}
      />
    ),
  },
  { key: "withinNormsShare", title: "В нормативе", render: (row) => formatShare(row.withinNormsShare) },
  { key: "attempts", title: "Попыток", render: (row) => row.attempts },
];

type TeacherRatingScreenProps = { api?: RatingApi };

/** `/teacher/rating` — рейтинг обучающихся закреплённых групп (спека 017). Фильтры и сортировка — в query. */
export function TeacherRatingScreen(props: TeacherRatingScreenProps) {
  return (
    <Suspense fallback={<Skeleton />}>
      <RatingContent {...props} />
    </Suspense>
  );
}

function RatingContent({ api = ratingApi }: TeacherRatingScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseRatingQuery(searchParams ?? new URLSearchParams());
  const { groupId, mode, period } = filters;
  const resource = useResource(
    (signal) => api.rating({ groupId: groupId || undefined, mode, period }, signal),
    [api, groupId, mode, period],
  );
  const navigate = (next: RatingFilters) =>
    router.replace(`${ROUTES.teacherRating}?${serializeRatingQuery(next)}`);

  return (
    <section aria-labelledby="teacher-rating-title">
      <PageHeader
        title="Рейтинг обучающихся"
        description="Баллы, рейтинги режимов и скорость относительно нормативов (реакция 30 с, отработка 3 мин)"
      />
      <ResourceView
        state={resource.state}
        onRetry={resource.reload}
        errorTitle="Не удалось загрузить рейтинг"
      >
        {(data: StudentRatingResponse) =>
          data.groups.length === 0 || data.groupId === null ? (
            <EmptyState
              title="Нет закреплённых групп"
              text="Рейтинг строится по группам, закреплённым за преподавателем. Обратитесь к администратору."
            />
          ) : (
            <RatingTable
              data={data}
              filters={{ ...filters, groupId: data.groupId }}
              onFilters={navigate}
              onOpen={(studentId, from) => router.push(ROUTES.teacherStudent(studentId, from))}
            />
          )
        }
      </ResourceView>
    </section>
  );
}

type RatingTableProps = {
  data: StudentRatingResponse;
  filters: RatingFilters;
  onFilters: (next: RatingFilters) => void;
  onOpen: (studentId: string, from: string) => void;
};

function RatingTable({ data, filters, onFilters, onOpen }: RatingTableProps) {
  const rows = rankRows(data.rows, filters.sort, filters.dir);
  const from = `${ROUTES.teacherRating}?${serializeRatingQuery(filters)}`;
  const sortBy = (key: SortKey) =>
    onFilters({
      ...filters,
      sort: key,
      dir: filters.sort === key ? (filters.dir === "asc" ? "desc" : "asc") : defaultDir(key),
    });
  const ariaSort = (key: SortKey) =>
    filters.sort === key ? (filters.dir === "asc" ? "ascending" : "descending") : "none";
  const arrow = (key: SortKey) => (filters.sort === key ? (filters.dir === "asc" ? "▲" : "▼") : "");

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Фильтры рейтинга">
        <SelectField
          className={styles.filter}
          label="Группа"
          value={filters.groupId}
          onChange={(event) => onFilters({ ...filters, groupId: event.target.value })}
        >
          {data.groups.map((group) => (
            <option key={group.groupId} value={group.groupId}>
              {group.groupId} ({group.studentCount})
            </option>
          ))}
        </SelectField>
        <SelectField
          className={styles.filter}
          label="Режим"
          value={filters.mode}
          onChange={(event) => onFilters({ ...filters, mode: event.target.value as RatingMode })}
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          className={styles.filter}
          label="Период"
          value={filters.period}
          onChange={(event) => onFilters({ ...filters, period: event.target.value as RatingPeriod })}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
      <Card>
        <table className={styles.table}>
          <caption>
            Группа {data.groupId}: место присваивается при {data.minAttempts} и более завершённых попытках;
            рейтинги режимов — за всё время
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.sort}>Место</span>
              </th>
              <th scope="col" aria-sort={ariaSort("fullName")}>
                <button
                  type="button"
                  className={`${styles.sort} ${styles["sort--left"]}`}
                  onClick={() => sortBy("fullName")}
                >
                  ФИО {arrow("fullName")}
                </button>
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" aria-sort={ariaSort(column.key)}>
                  <button type="button" className={styles.sort} onClick={() => sortBy(column.key)}>
                    {column.title} {arrow(column.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className={styles.muted}>
                  В группе нет обучающихся.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.studentId} className={styles.row} onClick={() => onOpen(row.studentId, from)}>
                  <td>{row.place ?? "—"}</td>
                  <th scope="row">
                    <Link
                      className={styles.name}
                      href={ROUTES.teacherStudent(row.studentId, from)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.fullName}
                    </Link>{" "}
                    {row.attempts === 0 ? (
                      <Tag>нет попыток</Tag>
                    ) : !row.enoughData ? (
                      <Tag tone="warning">мало данных</Tag>
                    ) : null}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>{column.render(row, data.norms)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
