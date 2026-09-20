import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { AiBadge, Button, StatusChip, Table } from "@/shared/ui";
import type { TableColumn } from "@/shared/ui";

import { APPROVED_STATUS, getSourceTitle, getValidationView } from "../config/dictionaries";
import type { ScenarioRow } from "../model/types";

import styles from "./ScenarioCatalog.module.css";

type ScenarioTableProps = {
  rows: ScenarioRow[];
  onPreview: (row: ScenarioRow) => void;
  onDelete: (row: ScenarioRow) => void;
};

const GENERATED_SOURCE = "generated";

function renderList(values: string[]) {
  return (
    <ul className={styles.catalog__list}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function renderSource(row: ScenarioRow) {
  return (
    <span className={styles.catalog__source} data-source={row.source}>
      {row.source === GENERATED_SOURCE ? <AiBadge title="Сценарий сгенерирован ИИ-модулем (мок)" /> : null}
      {getSourceTitle(row.source)}
    </span>
  );
}

function renderStatus(row: ScenarioRow) {
  const view = getValidationView(row.status);
  return (
    <span title={row.comment}>
      <StatusChip label={view.title} tone={view.tone} />
    </span>
  );
}

type RowActionsProps = Omit<ScenarioTableProps, "rows"> & { row: ScenarioRow };

function RowActions({ row, onPreview, onDelete }: RowActionsProps) {
  const isGenerated = row.source === GENERATED_SOURCE;
  return (
    <div className={styles.catalog__actions}>
      <Button variant="blue" size="sm" onClick={() => onPreview(row)} title="Предпросмотр (Alt + P)">
        просмотр
      </Button>
      <Link href={ROUTES.teacherScenario(row.id)} className={styles.catalog__edit} title="Изменить (Alt + E)">
        изменить
      </Link>
      {row.status === APPROVED_STATUS ? (
        <Link href={ROUTES.teacherSessionForScenario(row.id)} className={styles.catalog__assign}>
          в занятие
        </Link>
      ) : (
        <span className={styles.catalog__assignDisabled} title="Назначить можно только утверждённый сценарий">
          в занятие
        </span>
      )}
      <Button
        variant="danger"
        size="sm"
        onClick={() => onDelete(row)}
        disabled={!isGenerated}
        title={
          isGenerated
            ? "Удалить неактуальный сценарий (с подтверждением)"
            : "Системные шаблоны удалять нельзя (ТЗ §8)"
        }
      >
        удалить
      </Button>
    </div>
  );
}

function buildColumns({ onPreview, onDelete }: Omit<ScenarioTableProps, "rows">): TableColumn<ScenarioRow>[] {
  return [
    {
      key: "title",
      title: "Название",
      render: (row) => (
        <Link href={ROUTES.teacherScenario(row.id)} className={styles.catalog__title}>
          {row.title}
        </Link>
      ),
    },
    { key: "categories", title: "Категории", render: (row) => renderList(row.categories) },
    { key: "types", title: "Итоговые типы ЕКП", render: (row) => renderList(row.finalTypes) },
    { key: "difficulty", title: "Сложн.", align: "center", render: (row) => row.difficulty },
    { key: "source", title: "Источник", render: renderSource },
    { key: "status", title: "Статус валидации", render: renderStatus },
    {
      key: "actions",
      title: "Действия",
      render: (row) => <RowActions row={row} onPreview={onPreview} onDelete={onDelete} />,
    },
  ];
}

/** Таблица сценариев: название, категории, типы ЕКП, сложность, источник («ИИ»), статус, действия. */
export function ScenarioTable({ rows, onPreview, onDelete }: ScenarioTableProps) {
  return (
    <Table
      caption="Сценарии"
      columns={buildColumns({ onPreview, onDelete })}
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="Нет сценариев по выбранным фильтрам"
    />
  );
}
