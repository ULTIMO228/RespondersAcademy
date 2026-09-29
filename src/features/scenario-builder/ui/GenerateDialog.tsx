"use client";

import Link from "next/link";
import { useState } from "react";

import { ROUTES } from "@/shared/config";
import { AiBadge, Button, Modal, Select, StatusChip } from "@/shared/ui";

import { getValidationView } from "../config/dictionaries";
import type { ScenarioRow } from "../model/types";

import styles from "./ScenarioCatalog.module.css";

type GenerateDialogProps = {
  incidentGroups: string[];
  defaultGroup: string;
  onClose: () => void;
  /** Генерация через бэкенд (POST /scenarios/generate); возвращает сохранённые сценарии. */
  onGenerate: (category: string) => Promise<ScenarioRow[]>;
};

/** Выбор категории и генерация сценариев со статусом «на проверке». */
export function GenerateDialog({ incidentGroups, defaultGroup, onClose, onGenerate }: GenerateDialogProps) {
  const [group, setGroup] = useState(defaultGroup);
  const [rows, setRows] = useState<ScenarioRow[] | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      setRows(await onGenerate(group));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сгенерировать сценарии");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Сгенерировать сценарии (ИИ)"
      onClose={onClose}
      width={720}
      footer={
        <Button variant="primary" onClick={handleGenerate} disabled={isBusy}>
          {isBusy ? "Генерируем…" : "Сгенерировать"}
        </Button>
      }
    >
      <Select
        label="Категория событий (группа ЕКП)"
        value={group}
        onChange={(event) => {
          setGroup(event.target.value);
          setRows(null);
          setError(null);
        }}
        options={incidentGroups.map((incidentGroup) => ({ value: incidentGroup, label: incidentGroup }))}
      />
      {error ? (
        <p className={styles.catalog__error} role="alert">
          {error}
        </p>
      ) : null}
      {rows ? (
        <section className={styles.catalog__generated} aria-label="Результат генерации">
          <p className={styles.catalog__hint}>
            <AiBadge /> Результат для «{group}»: сценарии поступили на проверку преподавателю — до
            утверждения их нельзя назначить в занятие.
          </p>
          <ul className={styles.catalog__list}>
            {rows.map((row) => (
              <li key={row.id} className={styles.catalog__generatedItem}>
                <AiBadge title="Сгенерировано на сервере" /> <b>{row.title}</b>{" "}
                <StatusChip
                  label={getValidationView(row.status).title}
                  tone={getValidationView(row.status).tone}
                />
                <Link href={ROUTES.teacherScenario(row.id)} className={styles.catalog__edit}>
                  проверить
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Modal>
  );
}
