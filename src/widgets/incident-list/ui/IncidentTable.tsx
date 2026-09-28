import { IncidentRow } from "@/entities/incident";
import type { IncidentListItem, IncidentRowActions } from "@/entities/incident";
import { ArmIcon } from "@/shared/ui";

import type { LoadStatus } from "../model/types";
import styles from "./IncidentTable.module.css";

/** Колонки по реальному экрану ДДС (spec/000-фронт/04-pages/01-arm-main.md); null — служебная ячейка-иконка без подписи. */
export const JOURNAL_COLUMNS: Array<string | null> = [
  null,
  "Связи",
  null,
  "ЧС",
  null,
  "Опер.",
  "АРМ",
  "Номер",
  "Дата",
  "Время",
  "Тип происшествия",
  "Постр.",
  "Адрес",
  "Статус службы",
  null,
];

const SORT_COLUMN = "Дата";
const SORT_ICON_WIDTH = 24;
const SORT_ICON_HEIGHT = 32;

type IncidentTableProps = {
  items: IncidentListItem[];
  isExpanded: (item: IncidentListItem) => boolean;
  isLinksOpen: (item: IncidentListItem) => boolean;
  importantIds: ReadonlySet<string>;
  reminderIds: ReadonlySet<string>;
  actions: IncidentRowActions;
  isMotionReduced: boolean;
  status: LoadStatus;
  message: string;
  onRetry: () => void;
};

function TableHead() {
  return (
    <div className={styles["incident-table__head"]} role="row">
      {JOURNAL_COLUMNS.map((column, index) =>
        column ? (
          <span key={column} className={styles["incident-table__heading"]} role="columnheader">
            {column}
            {column === SORT_COLUMN ? (
              <ArmIcon
                name="sort-down"
                width={SORT_ICON_WIDTH}
                height={SORT_ICON_HEIGHT}
                label="по убыванию"
              />
            ) : null}
          </span>
        ) : (
          <span key={`tool-${index}`} aria-hidden="true" />
        ),
      )}
    </div>
  );
}

function TableState({
  status,
  message,
  onRetry,
}: Pick<IncidentTableProps, "status" | "message" | "onRetry">) {
  if (status === "loading") {
    return (
      <p className={styles["incident-table__empty"]} role="status">
        Загрузка списка…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className={styles["incident-table__empty"]} role="alert">
        Не удалось загрузить список: {message}{" "}
        <button type="button" className={styles["incident-table__retry"]} onClick={onRetry}>
          Повторить
        </button>
      </p>
    );
  }
  return <p className={styles["incident-table__empty"]}>Карточек нет</p>;
}

/** Таблица «Список происшествий»: заголовки колонок + строки; пусто — «Карточек нет» (ДДС_image2). */
export function IncidentTable(props: IncidentTableProps) {
  const { items, isExpanded, isLinksOpen, importantIds, reminderIds, actions, isMotionReduced } = props;
  return (
    <div className={styles["incident-table"]} role="table" aria-labelledby="incident-list-title">
      <TableHead />
      {items.length === 0 ? (
        <TableState status={props.status} message={props.message} onRetry={props.onRetry} />
      ) : (
        items.map((item) => (
          <IncidentRow
            key={item.id}
            item={item}
            isExpanded={isExpanded(item)}
            isLinksOpen={isLinksOpen(item)}
            isImportant={importantIds.has(item.id)}
            hasReminder={reminderIds.has(item.id)}
            isMotionReduced={isMotionReduced}
            actions={actions}
          />
        ))
      )}
    </div>
  );
}
