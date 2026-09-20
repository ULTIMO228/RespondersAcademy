"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

import type { GrammarError, TrainingMaterial } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { AiBadge, Button, Panel } from "@/shared/ui";

import {
  formatFileSize,
  GRAMMAR_CHECK_FIELD,
  GRAMMAR_SAMPLE_TEXT,
  GRAMMAR_TYPE_TITLES,
  MATERIAL_ACCEPT,
  MATERIAL_FORMAT_HINT,
} from "../config/materials";
import { highlightPhrases } from "../lib/highlightPhrases";

import styles from "./MaterialsBlock.module.css";

type MaterialsBlockProps = {
  materials: TrainingMaterial[];
  /** Загрузка файла-заглушки: наружу уходят только имя и размер (POST /api/mock/materials). */
  onUpload: (name: string, sizeBytes: number) => Promise<void>;
  /** Проверка грамматики через ИИ-шлюз (POST /api/mock/grammar-check). */
  onCheckGrammar: (text: string) => Promise<GrammarError[]>;
};

/** «Загрузка материалов» (ТЗ §12) + «Проверить грамматику» после ручных правок (сценарий А шаги 8–9). */
export function MaterialsBlock({ materials, onUpload, onCheckGrammar }: MaterialsBlockProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [text, setText] = useState(GRAMMAR_SAMPLE_TEXT);
  const [issues, setIssues] = useState<GrammarError[] | null>(null);
  const [isChecking, setChecking] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      await onUpload(file.name, file.size);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "Не удалось загрузить файл");
    }
  }

  async function handleCheck() {
    setChecking(true);
    try {
      setIssues(await onCheckGrammar(text));
    } finally {
      setChecking(false);
    }
  }

  const segments = highlightPhrases(
    text,
    (issues ?? []).map((issue) => issue.wrong),
  );
  return (
    <Panel
      title="Загрузка материалов"
      headerTone="dark"
      actions={
        <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
          Загрузить файл
        </Button>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept={MATERIAL_ACCEPT}
        className={styles.materials__input}
        aria-label="Файл учебного материала (DOCX, PDF, MP3)"
        onChange={handleFile}
      />
      <p className={styles.materials__field}>{MATERIAL_FORMAT_HINT}</p>
      {uploadError ? (
        <p className={styles.materials__alert} role="alert">
          {uploadError}
        </p>
      ) : null}
      {materials.length === 0 ? (
        <p className={styles.materials__field}>Материалы ещё не загружены.</p>
      ) : (
        <ul className={styles.materials__files} aria-label="Загруженные материалы">
          {materials.map((file) => (
            <li key={file.id} className={styles.materials__file} data-material-id={file.id}>
              <span className={styles.materials__format}>{file.format}</span>
              <span className={styles.materials__name}>{file.name}</span>
              <span className={styles.materials__size}>{formatFileSize(file.sizeBytes)}</span>
              <span className={styles.materials__size}>{formatDateTime(file.uploadedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.materials__textField}>
        <span className={styles.materials__field}>{GRAMMAR_CHECK_FIELD}</span>
        <textarea
          className={styles.materials__textarea}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className={styles.materials__check}>
        <Button variant="blue" size="sm" onClick={handleCheck} disabled={isChecking}>
          {isChecking ? "Проверяем…" : "Проверить грамматику"}
        </Button>
      </div>
      {issues ? (
        <section className={styles.materials__result} aria-label="Результат проверки грамматики">
          <p className={styles.materials__text}>
            {segments.map((segment, index) =>
              segment.isMatch ? (
                <mark key={index} className={styles.materials__error}>
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
          <p className={styles.materials__summary}>
            <AiBadge title="Проверка выполнена ИИ-модулем (мок)" /> найдено ошибок: {issues.length}
          </p>
          <ul className={styles.materials__issues}>
            {issues.map((issue, index) => (
              <li key={`${issue.wrong}-${index}`}>
                «{issue.wrong}» → «{issue.expected}» — {GRAMMAR_TYPE_TITLES[issue.type] ?? issue.type}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}
