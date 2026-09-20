import { Panel, Table } from "@/shared/ui";
import type { TableColumn } from "@/shared/ui";

import type { SummaryRow } from "../model/types";

import styles from "./ReportSession.module.css";

type ReportSummaryTableProps = {
  rows: SummaryRow[];
};

function renderTiming(sec: number | null, deviation: string, isExceeded: boolean) {
  return (
    <span className={styles.report__timing}>
      <span className={styles.report__mono}>{sec ?? "—"}</span>
      <span className={isExceeded ? styles["report__deviation--bad"] : styles.report__deviation}>
        {deviation}
      </span>
    </span>
  );
}

const COLUMNS: TableColumn<SummaryRow>[] = [
  { key: "name", title: "ФИО", render: (row) => row.fullName },
  { key: "arm", title: "№ АРМ", align: "center", render: (row) => row.armNumber },
  { key: "cards", title: "Карточек", align: "center", render: (row) => row.cardCount },
  {
    key: "reaction",
    title: "Ср. реакция, с (откл. от 30 с)",
    render: (row) => renderTiming(row.reactionSec, row.reactionDeviation, row.isReactionExceeded),
  },
  {
    key: "processing",
    title: "Ср. отработка, с (откл. от 180 с)",
    render: (row) => renderTiming(row.processingSec, row.processingDeviation, row.isProcessingExceeded),
  },
  { key: "grammar", title: "Грамм. ошибок", align: "center", render: (row) => row.grammarCount },
  {
    key: "score",
    title: "Интегральный балл",
    align: "center",
    render: (row) => <b className={styles.report__mono}>{row.score}</b>,
  },
];

/** 2. Сводная таблица по курсантам (ReportRow) — данные reports.json. */
export function ReportSummaryTable({ rows }: ReportSummaryTableProps) {
  return (
    <Panel title="2. Сводная таблица по курсантам" headerTone="dark">
      <div className={styles.report__tableWrap}>
        <Table
          caption="Сводная таблица по курсантам"
          columns={COLUMNS}
          rows={rows}
          getRowKey={(row) => row.id}
        />
      </div>
    </Panel>
  );
}
