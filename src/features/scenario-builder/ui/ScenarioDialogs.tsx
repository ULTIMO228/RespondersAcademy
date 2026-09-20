"use client";

import { Button, Modal, StatusChip } from "@/shared/ui";

import { getValidationView } from "../config/dictionaries";
import type { ScenarioRow } from "../model/types";

import styles from "./ScenarioCatalog.module.css";

type RowDialogProps = {
  row: ScenarioRow;
  onClose: () => void;
};

/** Предпросмотр сценария: категории, ключевые фразы эталона, статус. */
export function PreviewDialog({ row, onClose }: RowDialogProps) {
  const view = getValidationView(row.status);
  return (
    <Modal title={row.title} onClose={onClose} width={640}>
      <dl className={styles.catalog__preview}>
        <dt>Статус</dt>
        <dd>
          <StatusChip label={view.title} tone={view.tone} />
          {row.comment ? <span className={styles.catalog__comment}> {row.comment}</span> : null}
        </dd>
        <dt>Карточек в очереди</dt>
        <dd>{row.cardCount}</dd>
        <dt>Категории</dt>
        <dd>{row.categories.join("; ")}</dd>
        <dt>Итоговые типы ЕКП</dt>
        <dd>{row.finalTypes.join("; ")}</dd>
        <dt>Ключевые фразы эталона</dt>
        <dd>{row.keyPhrases.map((phrase) => `«${phrase}»`).join(", ")}</dd>
      </dl>
    </Modal>
  );
}

type DeleteDialogProps = RowDialogProps & {
  onConfirm: () => void;
};

/** Подтверждение удаления (статика волны 0): удаление фиксируется в журнале аудита. */
export function DeleteDialog({ row, onClose, onConfirm }: DeleteDialogProps) {
  return (
    <Modal
      title="Удалить сценарий?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Удалить
          </Button>
        </>
      }
    >
      <p>
        Сценарий «{row.title}» будет удалён из списка. Действие фиксируется в журнале аудита; системные данные
        преподаватель удалять не может.
      </p>
    </Modal>
  );
}
