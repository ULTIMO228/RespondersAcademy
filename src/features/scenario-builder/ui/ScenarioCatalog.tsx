"use client";

import { useState } from "react";

import { Button, Panel } from "@/shared/ui";
import type { SelectOption } from "@/shared/ui";

import { EMPTY_FILTER } from "../lib/scenarioQuery";
import type { ScenarioFilterState, ScenarioRow } from "../model/types";
import { CreateDialog } from "./CreateDialog";
import { GenerateDialog } from "./GenerateDialog";
import { DeleteDialog, PreviewDialog } from "./ScenarioDialogs";
import { ScenarioFilters } from "./ScenarioFilters";
import { ScenarioTable } from "./ScenarioTable";

import styles from "./ScenarioCatalog.module.css";

type ScenarioCatalogProps = {
  /** Строки уже отфильтрованы мок-слоем: фильтры уезжают query-параметрами GET /scenarios. */
  rows: ScenarioRow[];
  totalCount: number;
  incidentGroups: string[];
  templates: SelectOption[];
  defaultGenerateGroup: string;
  filter: ScenarioFilterState;
  onFilterChange: (filter: ScenarioFilterState) => void;
  onCreate: (title: string, cardId: string) => Promise<void>;
  onGenerate: (category: string) => Promise<ScenarioRow[]>;
  onDelete: (row: ScenarioRow) => Promise<void>;
};

type Dialog = { kind: "preview" | "delete"; row: ScenarioRow } | { kind: "generate" | "create" } | null;

/** Список сценариев: фильтры, создание вручную, мок-генерация (ИИ) и удаление с подтверждением. */
export function ScenarioCatalog({
  rows,
  totalCount,
  incidentGroups,
  templates,
  defaultGenerateGroup,
  filter,
  onFilterChange,
  onCreate,
  onGenerate,
  onDelete,
}: ScenarioCatalogProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const closeDialog = () => setDialog(null);
  return (
    <Panel
      title={`Сценарии: ${rows.length} из ${totalCount}`}
      headerTone="dark"
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "create" })}>
            Создать сценарий
          </Button>
          <Button variant="primary" size="sm" onClick={() => setDialog({ kind: "generate" })}>
            Сгенерировать (ИИ)
          </Button>
        </>
      }
    >
      <ScenarioFilters
        filter={filter}
        incidentGroups={incidentGroups}
        onChange={onFilterChange}
        onReset={() => onFilterChange(EMPTY_FILTER)}
      />
      <div className={styles.catalog__table}>
        <ScenarioTable
          rows={rows}
          onPreview={(row) => setDialog({ kind: "preview", row })}
          onDelete={(row) => setDialog({ kind: "delete", row })}
        />
      </div>
      {dialog?.kind === "preview" ? <PreviewDialog row={dialog.row} onClose={closeDialog} /> : null}
      {dialog?.kind === "delete" ? (
        <DeleteDialog
          row={dialog.row}
          onClose={closeDialog}
          onConfirm={async () => {
            await onDelete(dialog.row);
            closeDialog();
          }}
        />
      ) : null}
      {dialog?.kind === "generate" ? (
        <GenerateDialog
          incidentGroups={incidentGroups}
          defaultGroup={defaultGenerateGroup}
          onClose={closeDialog}
          onGenerate={onGenerate}
        />
      ) : null}
      {dialog?.kind === "create" ? (
        <CreateDialog templates={templates} onClose={closeDialog} onCreate={onCreate} />
      ) : null}
    </Panel>
  );
}
