"use client";

import { useState } from "react";

import type { KbArticle, KbSections } from "@/shared/api";
import { Alert, PlatformButton } from "@/shared/ui/platform";

import styles from "./Reference.module.css";

const SECTION_KEYS: [keyof KbSections, string][] = [
  ["signs", "Признаки происшествия"],
  ["notification", "Оповещение служб"],
  ["clarify", "Что уточнить у заявителя"],
  ["ddsDecision", "Решение диспетчера ДДС"],
  ["typicalErrors", "Типичные ошибки"],
];

type ArticleEditorProps = {
  article: KbArticle;
  onSave: (sections: KbSections) => Promise<void>;
  onCancel: () => void;
};

/** Правка пяти разделов статьи: один пункт на строку; пустые строки отбрасываются, введённое сохраняется при ошибке. */
export function ArticleEditor({ article, onSave, onCancel }: ArticleEditorProps) {
  const [values, setValues] = useState<Record<keyof KbSections, string>>(() => ({
    signs: article.sections.signs.join("\n"),
    notification: article.sections.notification.join("\n"),
    clarify: article.sections.clarify.join("\n"),
    ddsDecision: article.sections.ddsDecision.join("\n"),
    typicalErrors: article.sections.typicalErrors.join("\n"),
  }));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const toItems = (text: string) =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    try {
      await onSave({
        signs: toItems(values.signs),
        notification: toItems(values.notification),
        clarify: toItems(values.clarify),
        ddsDecision: toItems(values.ddsDecision),
        typicalErrors: toItems(values.typicalErrors),
      });
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось сохранить статью");
      setSaving(false);
    }
  };

  return (
    <form
      className={styles.editor}
      aria-label={`Правка статьи: ${article.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className={styles.article__title}>{article.title}</h2>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {SECTION_KEYS.map(([key, title]) => (
        <label key={key} className={styles.editor__field}>
          <span className={styles.editor__label}>{title}</span>
          <textarea
            className={styles.editor__textarea}
            rows={4}
            value={values[key]}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
          />
          <span className={styles.muted}>Один пункт на строку</span>
        </label>
      ))}
      <div className={styles.editor__bar}>
        <PlatformButton type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? "Сохранение…" : "Сохранить"}
        </PlatformButton>
        <PlatformButton variant="ghost" onClick={onCancel} disabled={isSaving}>
          Отмена
        </PlatformButton>
      </div>
    </form>
  );
}
