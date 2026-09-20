import type { GroupReport, ReportContract } from "@/shared/api";
import { AiBadge, BarChart, ChartDataTable, LineChart, Panel } from "@/shared/ui";

import { buildDynamics, buildHeatRows, buildScoreByStudent, buildStageSeries } from "../lib/buildChartData";
import { ErrorHeatmap } from "./ErrorHeatmap";

import styles from "./ReportCharts.module.css";

type ReportChartsProps = {
  reports: ReportContract[];
  groupReport: GroupReport | null;
};

const SECONDS_UNIT = "с";

/**
 * 7. Графики отчёта (inline-SVG без библиотек): byStage, byErrorType (heatmap), dynamics.
 * byStage и dynamics дублируются таблицей значений — текстовая альтернатива и читаемость в ч/б печати.
 */
export function ReportCharts({ reports, groupReport }: ReportChartsProps) {
  const stages = buildStageSeries(reports);
  const dynamics = buildDynamics(reports);
  const scoreByStudent = buildScoreByStudent(reports);
  const criteria = groupReport?.charts.errorsByCriterion.series;
  return (
    <Panel title="7. Графики и диаграммы" headerTone="dark">
      <section className={styles.charts__block} aria-label="По этапам отработки (byStage)">
        <h3 className={styles.charts__title}>По этапам отработки</h3>
        <div className={styles.charts__row} data-block="byStage">
          <LineChart
            title="Первичная реакция по попыткам, с"
            labels={stages.labels}
            series={[{ name: "Реакция", values: stages.reactionSec }]}
            unit={SECONDS_UNIT}
            norms={[{ value: stages.reactionNormSec, label: `норматив ${stages.reactionNormSec} с` }]}
          />
          <LineChart
            title="Полная отработка по попыткам, с"
            labels={stages.labels}
            series={[{ name: "Отработка", values: stages.processingSec, tone: "orange" }]}
            unit={SECONDS_UNIT}
            norms={[{ value: stages.processingNormSec, label: `норматив ${stages.processingNormSec} с` }]}
          />
        </div>
        <ChartDataTable
          caption={`Тайминги по попыткам, с (нормативы ${stages.reactionNormSec} / ${stages.processingNormSec} с)`}
          labelTitle="Попытка"
          labels={stages.labels}
          columns={[
            { title: "Реакция, с", values: stages.reactionSec },
            { title: "Отработка, с", values: stages.processingSec },
          ]}
        />
      </section>
      <section className={styles.charts__block} aria-label="По типам ошибок (byErrorType)">
        <h3 className={styles.charts__title}>
          По типам ошибок{" "}
          <span className={styles.charts__optional}>опциональный модуль аналитики (ТЗ §6)</span>
        </h3>
        <ErrorHeatmap
          rows={buildHeatRows(reports)}
          criteria={criteria ? { labels: criteria.criteria, values: criteria.errors } : undefined}
        />
      </section>
      <section className={styles.charts__block} aria-label="Динамика (dynamics)">
        <h3 className={styles.charts__title}>
          Динамика <AiBadge title="Баллы — мок-оценка ИИ с учётом правок преподавателя" />
        </h3>
        <div className={styles.charts__row} data-block="dynamics">
          <BarChart
            title="Интегральный балл по курсантам"
            labels={scoreByStudent.labels}
            values={scoreByStudent.values}
          />
          <LineChart
            title={`Баллы по попыткам; средний балл занятия — ${dynamics.average}`}
            labels={dynamics.labels}
            series={[
              { name: "Балл попытки", values: dynamics.scores },
              { name: "Средний балл занятия", values: dynamics.averageLine, tone: "gray" },
            ]}
          />
        </div>
        <ChartDataTable
          caption="Балл по попыткам занятия"
          labelTitle="Попытка"
          labels={dynamics.labels}
          columns={[{ title: "Балл", values: dynamics.scores }]}
        />
      </section>
    </Panel>
  );
}
