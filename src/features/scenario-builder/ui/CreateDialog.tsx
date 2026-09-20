"use client";

import { useState } from "react";

import { Button, Input, Modal, Select } from "@/shared/ui";
import type { SelectOption } from "@/shared/ui";

import styles from "./ScenarioCatalog.module.css";

type CreateDialogProps = {
  templates: SelectOption[];
  onClose: () => void;
  /** Создаёт черновик через мок-слой (POST /scenarios) и открывает его в редакторе. */
  onCreate: (title: string, cardId: string) => Promise<void>;
};

/** «Создать сценарий» вручную на базе карточки-шаблона: `source: template`, `validation.status: draft`. */
export function CreateDialog({ templates, onClose, onCreate }: CreateDialogProps) {
  const [title, setTitle] = useState("Новый сценарий");
  const [cardId, setCardId] = useState(templates[0]?.value ?? "");
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(title.trim(), cardId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать сценарий");
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Создать сценарий"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!title.trim() || !cardId || isBusy}>
            {isBusy ? "Создаём…" : "Создать черновик"}
          </Button>
        </>
      }
    >
      <Input label="Название сценария" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Select
        label="Карточка-шаблон (учебная ситуация)"
        value={cardId}
        onChange={(event) => setCardId(event.target.value)}
        options={templates}
      />
      <p className={styles.catalog__hint}>
        Черновик создаётся со статусом «черновик» и нормативами 30 / 180 сек; эталон и критерии успешности
        заполняются в редакторе.
      </p>
      {error ? (
        <p className={styles.catalog__error} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
