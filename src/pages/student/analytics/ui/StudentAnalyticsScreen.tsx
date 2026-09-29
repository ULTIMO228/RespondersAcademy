"use client";

import { useState } from "react";

import {
  describeErrorType,
  PROCESSING_NORM_MS,
  REACTION_NORM_MS,
  summarizePerformance,
} from "@/entities/report";
import type { Analytics, Recommendation, Stats } from "@/shared/api";
import { formatDuration } from "@/shared/lib";
import {
  AiTag,
  Card,
  DataTable,
  EmptyState,
  NormChart,
  PageHeader,
  ResourceView,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";
import { RecommendationList } from "@/widgets/recommendation-list";

import { studentAnalyticsApi } from "../api/analyticsApi";
import type { StudentAnalyticsApi } from "../api/analyticsApi";
import { toDynamics, toModeTimes } from "../lib/series";
import styles from "./StudentAnalytics.module.css";

const MS_IN_SECOND = 1000;

type BreakdownRow = { key: string; title: string; stats: Stats };

const BREAKDOWN_COLUMNS: DataColumn<BreakdownRow>[] = [
  { key: "title", title: "Срез", render: (row) => row.title },
  { key: "count", title: "Попыток", numeric: true, render: (row) => row.stats.count },
  { key: "score", title: "Средний балл", numeric: true, render: (row) => row.stats.averageScore },
  {
    key: "reaction",
    title: "Реакция",
    numeric: true,
    render: (row) => `${Math.round(row.stats.averageReactionMs / MS_IN_SECOND)} с`,
  },
  {
    key: "processing",
    title: "Отработка",
    numeric: true,
    render: (row) => formatDuration(row.stats.averageProcessingMs),
  },
];

const FORMAT_TITLES = { training: "Тренировки", exam: "Экзамены" } as const;
const MODE_ROW_TITLES = { operator112: "Режим 112", dds: "Режим ДДС" } as const;

/** Сервер может не прислать ключ без попыток: разрез с нулём попыток скрывается, а не роняет страницу. */
const EMPTY_STATS: Stats = {
  count: 0,
  averageScore: 0,
  averageReactionMs: 0,
  averageProcessingMs: 0,
  replays: 0,
  hintsShown: 0,
};

function breakdownRows(analytics: Analytics): BreakdownRow[] {
  return [
    ...(["operator112", "dds"] as const).map((mode) => ({
      key: `mode-${mode}`,
      title: MODE_ROW_TITLES[mode],
      stats: analytics.byMode[mode] ?? EMPTY_STATS,
    })),
    ...(["training", "exam"] as const).map((format) => ({
      key: `format-${format}`,
      title: FORMAT_TITLES[format],
      stats: analytics.byFormat[format] ?? EMPTY_STATS,
    })),
    ...Object.entries(analytics.byGroup).map(([group, stats]) => ({
      key: `group-${group}`,
      title: `Группа: ${group}`,
      stats,
    })),
  ].filter((row) => row.stats.count > 0);
}

type StudentAnalyticsScreenProps = { api?: StudentAnalyticsApi };

/**
 * «Аналитика» (T044): динамика баллов, время против нормативов АРМ (линия норматива), разрезы по режиму/формату/группе,
 * типичные ошибки и рекомендации. У каждого графика есть таблица-дублёр. «Изучить» принимает рекомендацию (A5).
 */
export function StudentAnalyticsScreen({ api = studentAnalyticsApi }: StudentAnalyticsScreenProps) {
  const analytics = useResource((signal) => api.analytics(signal), [api]);
  const recommendations = useResource((signal) => api.recommendations(signal), [api]);
  const [accepted, setAccepted] = useState<Record<string, string>>({});

  const accept = (recommendation: Recommendation) => {
    if (recommendation.acceptedAt || accepted[recommendation.id]) return;
    void api
      .accept(recommendation.id)
      .then((result) =>
        setAccepted((current) => ({ ...current, [recommendation.id]: result.acceptedAt ?? "accepted" })),
      )
      .catch(() => undefined);
  };

  return (
    <>
      <PageHeader title="Аналитика" description="Динамика и нормативы по вашим попыткам" />
      <ResourceView
        state={analytics.state}
        onRetry={analytics.reload}
        errorTitle="Не удалось загрузить аналитику"
        skeletonLines={6}
      >
        {(data) => {
          const summary = summarizePerformance(data);
          if (summary.attempts === 0) {
            return (
              <Card>
                <EmptyState
                  title="Аналитики пока нет"
                  text="Она появится после первой выполненной попытки."
                />
              </Card>
            );
          }
          const dynamics = toDynamics(data);
          const times = toModeTimes(data);
          const rows = breakdownRows(data);
          return (
            <div className={styles.stack}>
              <div className={styles.grid}>
                <Card title="Динамика баллов">
                  {dynamics.values.length === 0 ? (
                    <EmptyState title="Ряд пуст" text="Динамика строится по датам выполненных попыток." />
                  ) : (
                    <NormChart
                      title="Динамика баллов"
                      labels={dynamics.labels}
                      values={dynamics.values}
                      seriesName="Балл за попытку"
                    />
                  )}
                </Card>
                <Card title="Типичные ошибки">
                  {data.topErrors.length === 0 ? (
                    <EmptyState title="Типичных ошибок нет" text="Повторяющихся замечаний не найдено." />
                  ) : (
                    <DataTable
                      caption="Типичные ошибки"
                      columns={[
                        { key: "type", title: "Ошибка", render: (row) => describeErrorType(row.type) },
                        { key: "count", title: "Раз", numeric: true, render: (row) => row.count },
                      ]}
                      rows={data.topErrors}
                      getRowKey={(row) => row.type}
                    />
                  )}
                </Card>
              </div>

              <div className={styles.pair}>
                <Card title="Реакция на новый вызов">
                  <NormChart
                    title="Средняя реакция по режимам, секунды"
                    kind="bar"
                    tone="reaction"
                    labels={times.labels}
                    values={times.reactionSec}
                    seriesName="Реакция"
                    unit="с"
                    norm={{ value: REACTION_NORM_MS / MS_IN_SECOND, label: "норматив 30 с" }}
                  />
                </Card>
                <Card title="Полная отработка">
                  <NormChart
                    title="Среднее время отработки по режимам, секунды"
                    kind="bar"
                    labels={times.labels}
                    values={times.processingSec}
                    seriesName="Отработка"
                    unit="с"
                    norm={{ value: PROCESSING_NORM_MS / MS_IN_SECOND, label: "норматив 3 мин" }}
                  />
                </Card>
              </div>

              <Card title="Разрезы">
                <DataTable
                  caption="Разрезы по режиму, формату и группе"
                  columns={BREAKDOWN_COLUMNS}
                  rows={rows}
                  getRowKey={(row) => row.key}
                />
              </Card>
            </div>
          );
        }}
      </ResourceView>

      <div className={[styles.stack, styles.stack__after].join(" ")}>
        <Card title="Рекомендации" actions={<AiTag title="Рекомендации подготовлены ИИ-модулем" />}>
          <ResourceView
            state={recommendations.state}
            onRetry={recommendations.reload}
            errorTitle="Не удалось загрузить рекомендации"
            skeletonLines={3}
          >
            {(items) =>
              items.length === 0 ? (
                <EmptyState
                  title="Рекомендаций пока нет"
                  text="Они появятся, когда накопится история попыток."
                />
              ) : (
                <RecommendationList
                  items={items.map((item) =>
                    accepted[item.id] ? { ...item, acceptedAt: accepted[item.id] } : item,
                  )}
                  onOpen={accept}
                />
              )
            }
          </ResourceView>
        </Card>
      </div>
    </>
  );
}
