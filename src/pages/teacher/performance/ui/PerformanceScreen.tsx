"use client";

import { useMemo, useState } from "react";

import { performancePdfUrl, performanceXlsxUrl } from "@/shared/api";
import type {
  PerformanceLevel,
  PerformanceMode,
  PerformancePeriod,
  PerformanceQuery,
  PerformanceReport,
  PerformanceStats,
} from "@/shared/api";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  ResourceView,
  SegmentedControl,
  SelectField,
  StatGroup,
  StatTile,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { performanceApi } from "../api/performanceApi";
import type { PerformanceApi } from "../api/performanceApi";

import styles from "./PerformanceScreen.module.css";

const NO_VALUE = "—";

const MODE_OPTIONS: { value: PerformanceMode; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "dds", label: "ДДС" },
  { value: "operator112", label: "Специалист-112" },
];

const PERIOD_OPTIONS: { value: PerformancePeriod; label: string }[] = [
  { value: "2w", label: "2 недели" },
  { value: "1m", label: "Месяц" },
  { value: "all", label: "Всё время" },
  { value: "range", label: "Свои даты" },
];

type Section = "groups" | "students" | "errors";
const SECTION_OPTIONS: { value: Section; label: string }[] = [
  { value: "groups", label: "Группы" },
  { value: "students", label: "Обучающиеся" },
  { value: "errors", label: "Ошибки" },
];

const LEVELS: Record<PerformanceLevel, { icon: string; label: string }> = {
  ok: { icon: "✓", label: "в норме" },
  risk: { icon: "!", label: "зона риска" },
  noData: { icon: "○", label: "мало данных" },
};

const score = (value: number | null) => (value === null ? NO_VALUE : String(value).replace(".", ","));
const percent = (share: number | null) => (share === null ? NO_VALUE : `${Math.round(share * 100)}%`);
const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${String(Math.abs(value)).replace(".", ",")}`;

function Level({ level }: { level: PerformanceLevel }) {
  const meta = LEVELS[level];
  return (
    <span className={`${styles.level} ${styles[`level--${level}`]}`}>
      <span aria-hidden="true">{meta.icon}</span> {meta.label}
    </span>
  );
}

const statColumns = <TRow,>(pick: (row: TRow) => PerformanceStats): DataColumn<TRow>[] => [
  { key: "attempts", title: "Попыток", numeric: true, render: (row) => pick(row).attempts },
  { key: "avg", title: "Средний балл", numeric: true, render: (row) => score(pick(row).avgScore) },
  {
    key: "reaction",
    title: "Реакция в норме",
    numeric: true,
    render: (row) => percent(pick(row).reactionInNormShare),
  },
  {
    key: "processing",
    title: "Отработка в норме",
    numeric: true,
    render: (row) => percent(pick(row).processingInNormShare),
  },
  {
    key: "exams",
    title: "Экзамены (сдано)",
    numeric: true,
    render: (row) => `${pick(row).examsPassed} из ${pick(row).exams}`,
  },
  { key: "weak", title: "Слабый этап", render: (row) => pick(row).weakStage ?? NO_VALUE },
  { key: "level", title: "Оценка", render: (row) => <Level level={pick(row).level} /> },
];

type Filters = {
  mode: PerformanceMode;
  period: PerformancePeriod;
  groupId: string;
  from: string;
  to: string;
};

/** Запрос к серверу; для «Своих дат» без обеих дат запроса нет (`null`). */
function toQuery(filters: Filters): PerformanceQuery | null {
  const query: PerformanceQuery = { mode: filters.mode, period: filters.period };
  if (filters.period === "range") {
    if (!filters.from || !filters.to) return null;
    query.from = filters.from;
    query.to = filters.to;
  }
  if (filters.groupId) query.groupId = filters.groupId;
  return query;
}

type PerformanceScreenProps = { api?: PerformanceApi };

/**
 * «Успеваемость» (спека 005): итоги по всем группам или одной, сравнение групп, обучающиеся, частые ошибки; выгрузка в
 * Excel и печать PDF с теми же фильтрами. Нужен бэкенд. Числа не выдумываются: при малом числе попыток — «мало данных».
 */
export function PerformanceScreen({ api = performanceApi }: PerformanceScreenProps) {
  const [filters, setFilters] = useState<Filters>({
    mode: "all",
    period: "1m",
    groupId: "",
    from: "",
    to: "",
  });
  const [section, setSection] = useState<Section>("groups");
  const query = useMemo(() => toQuery(filters), [filters]);
  const groups = useResource((signal) => api.groups(signal), [api]);
  const report = useResource(
    (signal) => (query ? api.report(query, signal) : new Promise<PerformanceReport>(() => {})),
    [api, query?.mode, query?.period, query?.from, query?.to, query?.groupId],
  );
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <section className={styles.page} aria-labelledby="teacher-performance-title">
      <PageHeader
        title="Успеваемость"
        description="Итоги по группам и обучающимся за выбранный период: для печати и отчёта руководству"
        actions={
          query ? (
            <div className={styles.actions}>
              <a className={styles.actions__link} href={performanceXlsxUrl(query)} download>
                Скачать в Excel
              </a>
              <a
                className={styles.actions__link}
                href={performancePdfUrl(query)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Распечатать (PDF откроется в новой вкладке)"
              >
                Распечатать
              </a>
            </div>
          ) : null
        }
      />

      <div className={styles.filters}>
        <SelectField
          label="Группа"
          value={filters.groupId}
          onChange={(event) => set({ groupId: event.target.value })}
        >
          <option value="">Все группы</option>
          {groups.state.status === "ready"
            ? groups.state.data.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.title}
                </option>
              ))
            : null}
        </SelectField>
        <div className={styles.filters__group}>
          <span className={styles.filters__label}>Период</span>
          <SegmentedControl
            label="Период"
            options={PERIOD_OPTIONS}
            value={filters.period}
            onChange={(period) => set({ period })}
          />
        </div>
        <div className={styles.filters__group}>
          <span className={styles.filters__label}>Режим</span>
          <SegmentedControl
            label="Режим"
            options={MODE_OPTIONS}
            value={filters.mode}
            onChange={(mode) => set({ mode })}
          />
        </div>
        {filters.period === "range" ? (
          <div className={styles.dates}>
            <label className={styles.date}>
              С даты
              <input
                className={styles.date__input}
                type="date"
                value={filters.from}
                onChange={(event) => set({ from: event.target.value })}
              />
            </label>
            <label className={styles.date}>
              По дату
              <input
                className={styles.date__input}
                type="date"
                value={filters.to}
                onChange={(event) => set({ to: event.target.value })}
              />
            </label>
          </div>
        ) : null}
      </div>

      <ResourceView state={report.state} onRetry={report.reload} errorTitle="Не удалось построить сводку">
        {(data) => <ReportBody data={data} section={section} onSection={setSection} />}
      </ResourceView>
    </section>
  );
}

function ReportBody({
  data,
  section,
  onSection,
}: {
  data: PerformanceReport;
  section: Section;
  onSection: (section: Section) => void;
}) {
  if (data.groups.length === 0 && data.students.length === 0) {
    return (
      <EmptyState
        title="Нет данных за выбранный период"
        text="Выберите другой период или режим, либо дождитесь первых оценённых попыток."
      />
    );
  }
  const { totals } = data;
  return (
    <>
      <section className={styles.section} aria-label="Итого">
        <StatGroup>
          <StatTile
            label="Обучающихся"
            value={totals.students}
            note={`с попытками: ${totals.activeStudents}`}
          />
          <StatTile label="Попыток" value={totals.attempts} />
          <StatTile
            label="Средний балл"
            value={score(totals.avgScore)}
            note={totals.delta === null ? undefined : `${signed(totals.delta)} к прошлому периоду`}
          />
          <StatTile
            label="Реакция в норме"
            value={percent(totals.reactionInNormShare)}
            note="норматив 30 с"
          />
          <StatTile
            label="Отработка в норме"
            value={percent(totals.processingInNormShare)}
            note="норматив 3 мин"
          />
          <StatTile label="Экзамены" value={`${totals.examsPassed} из ${totals.exams}`} note="сдано" />
        </StatGroup>
        <p className={styles.note}>
          «Мало данных» — меньше {data.thresholds.minAttemptsStudent} попыток у обучающегося или{" "}
          {data.thresholds.minAttemptsGroup} у группы; зона риска — средний балл ниже{" "}
          {data.thresholds.riskScore}.
        </p>
      </section>

      <SegmentedControl label="Раздел" options={SECTION_OPTIONS} value={section} onChange={onSection} />

      {section === "groups" ? (
        <Card>
          <DataTable
            caption="Сравнение групп"
            columns={[
              {
                key: "group",
                title: "Группа",
                render: (row) => <span className={styles.nowrap}>{row.title}</span>,
              },
              { key: "students", title: "Обучающихся", numeric: true, render: (row) => row.stats.students },
              ...statColumns((row: PerformanceReport["groups"][number]) => row.stats),
            ]}
            rows={data.groups}
            getRowKey={(row) => row.groupId}
          />
        </Card>
      ) : null}
      {section === "students" ? (
        <Card>
          <DataTable
            caption="Успеваемость обучающихся"
            columns={[
              {
                key: "name",
                title: "ФИО",
                render: (row) => <span className={styles.nowrap}>{row.name}</span>,
              },
              { key: "group", title: "Группа", render: (row) => row.groupId ?? "Без группы" },
              ...statColumns((row: PerformanceReport["students"][number]) => row.stats),
            ]}
            rows={data.students}
            getRowKey={(row) => row.studentId}
          />
        </Card>
      ) : null}
      {section === "errors" ? (
        <Card>
          <DataTable
            caption="Типичные ошибки"
            columns={[
              { key: "label", title: "Ошибка", render: (row) => row.label },
              { key: "attempts", title: "Попыток с ошибкой", numeric: true, render: (row) => row.attempts },
            ]}
            rows={data.topErrors}
            getRowKey={(row) => row.label}
            emptyText="Ошибок за период нет"
          />
        </Card>
      ) : null}
    </>
  );
}
