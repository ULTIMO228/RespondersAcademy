import Link from "next/link";

import { Panel, Table } from "@/shared/ui";
import type { TableColumn } from "@/shared/ui";

import type { CallLogRow } from "../lib/cardContext";

import styles from "./CallLog.module.css";

type CallLogProps = {
  rows: CallLogRow[];
  isLoading?: boolean;
  /** Ошибка загрузки попыток (вызовы этой вкладки при этом видны). */
  error?: string | null;
};

const NOT_SAVED_TITLE = "Вызов не записан в попытку (нет открытой попытки по карточке)";

function renderCard(row: CallLogRow) {
  if (!row.card) return <span title="Прямой вызов по номеру">—</span>;
  return (
    <>
      <Link
        className={styles["call-log__link"]}
        href={row.card.href}
        title={`Открыть карточку ${row.card.label}`}
      >
        {row.card.label}
      </Link>
      {row.isSaved ? null : (
        <span className={styles["call-log__unsaved"]} title={NOT_SAVED_TITLE}>
          {" "}
          (не записан)
        </span>
      )}
    </>
  );
}

const CALL_LOG_COLUMNS: TableColumn<CallLogRow>[] = [
  { key: "startedAt", title: "Дата/время", width: "160px", render: (row) => row.startedAt },
  {
    key: "number",
    title: "Номер",
    width: "70px",
    render: (row) => <span className={styles["call-log__number"]}>{row.number}</span>,
  },
  { key: "subscriber", title: "Абонент", render: (row) => row.subscriberTitle },
  { key: "duration", title: "Длительность", width: "100px", align: "right", render: (row) => row.duration },
  { key: "card", title: "Карточка", width: "160px", render: renderCard },
];

/** Журнал вызовов точки C (PhoneCall): дата/время, номер, длительность, ссылка на карточку. */
export function CallLog({ rows, isLoading = false, error = null }: CallLogProps) {
  return (
    <Panel title="Журнал вызовов" headerTone="dark" className={styles["call-log"]}>
      {error ? (
        <p className={styles["call-log__error"]} role="alert">
          {error}
        </p>
      ) : null}
      <Table
        columns={CALL_LOG_COLUMNS}
        rows={rows}
        getRowKey={(row) => row.id}
        caption="Журнал вызовов"
        emptyText={isLoading ? "Загрузка журнала…" : "Вызовов нет"}
      />
    </Panel>
  );
}
