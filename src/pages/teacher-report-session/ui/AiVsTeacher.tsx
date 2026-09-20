"use client";

import { useState } from "react";

import { AiBadge, Button, Input, Panel, Tabs } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";

import type { AttemptView } from "../model/types";

import styles from "./ReportSession.module.css";

export type OverrideDraft = { score: number; comment: string };

type AiVsTeacherProps = {
  attempts: AttemptView[];
  /** Преподаватель сессии — автор правки в аудите. */
  teacherId: string;
  teacherName: string;
  onSave: (attemptId: string, draft: OverrideDraft) => Promise<void>;
};

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const COMMENT_REQUIRED = "Укажите комментарий: правка оценки без обоснования не сохраняется";
const SCORE_INVALID = `Балл преподавателя — целое число от ${MIN_SCORE} до ${MAX_SCORE}`;

function describeOverride(attempt: AttemptView, teacherId: string, teacherName: string): string | null {
  const override = attempt.teacherOverride;
  if (!override) return null;
  const author = override.by === teacherId ? teacherName : override.by;
  return `${formatDateTime(override.at)} — оценка изменена преподавателем ${author} (попытка ${attempt.id}): было ${attempt.aiTotal} → стало ${override.score}`;
}

/**
 * 4. Оценка: ИИ vs преподаватель — по каждой попытке (T3.4-09). Приоритет за преподавателем (Q&A в3):
 * сохранение пишет `teacherOverride` через мок-API, пересчитывает итог отчёта и оставляет запись
 * в журнале аудита (видна в `/admin/system` → журналы). Оценка ИИ остаётся на экране рядом.
 */
export function AiVsTeacher({ attempts, teacherId, teacherName, onSave }: AiVsTeacherProps) {
  const [activeId, setActiveId] = useState(attempts[0]?.id ?? "");
  const [draft, setDraft] = useState<OverrideDraft>({ score: attempts[0]?.finalTotal ?? 0, comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const attempt = attempts.find((item) => item.id === activeId) ?? attempts[0];
  if (!attempt) return null;

  const selectAttempt = (attemptId: string) => {
    const next = attempts.find((item) => item.id === attemptId);
    setActiveId(attemptId);
    setError(null);
    setDraft({ score: next?.finalTotal ?? 0, comment: next?.teacherOverride?.comment ?? "" });
  };

  const handleSave = async () => {
    const comment = draft.comment.trim();
    if (!Number.isInteger(draft.score) || draft.score < MIN_SCORE || draft.score > MAX_SCORE) {
      setError(SCORE_INVALID);
      return;
    }
    if (!comment) {
      setError(COMMENT_REQUIRED);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(attempt.id, { score: draft.score, comment });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : SCORE_INVALID);
    } finally {
      setSaving(false);
    }
  };

  const auditLine = describeOverride(attempt, teacherId, teacherName);
  return (
    <Panel title="4. Оценка: ИИ vs преподаватель" headerTone="dark">
      <Tabs
        label="Попытка"
        activeId={attempt.id}
        onChange={selectAttempt}
        items={attempts.map((item) => ({ id: item.id, title: `${item.studentName} · ${item.cardNumber}` }))}
      />
      <div className={styles.report__assessment}>
        <section className={styles.report__teacher} aria-label="Оценка преподавателя">
          <p className={styles.report__final}>
            Итоговый балл: <b data-final-score>{attempt.finalTotal}</b>
            <span className={styles.report__finalSource}>
              {attempt.teacherOverride
                ? "оценка преподавателя (приоритет)"
                : "мок-оценка ИИ, не подтверждена"}
            </span>
          </p>
          <Input
            label="Балл преподавателя (0–100)"
            type="number"
            min={MIN_SCORE}
            max={MAX_SCORE}
            value={draft.score}
            onChange={(event) => setDraft({ ...draft, score: Number(event.target.value) })}
          />
          <label className={styles.report__label}>
            Комментарий преподавателя (обязателен)
            <textarea
              className={styles.report__textarea}
              rows={2}
              value={draft.comment}
              onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
            />
          </label>
          {error ? (
            <p className={styles.report__error} role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Сохранение…" : "Сохранить оценку"}
          </Button>
        </section>
        <section className={styles.report__aiScore} aria-label="Мок-оценка ИИ">
          <p>
            <AiBadge /> Оценка ИИ: <b>{attempt.aiTotal}</b>
          </p>
          <p className={styles.report__muted}>{attempt.aiComment}</p>
        </section>
      </div>
      <ul className={styles.report__audit} aria-label="Журнал аудита оценок">
        {auditLine ? (
          <li>{auditLine}</li>
        ) : (
          <li className={styles.report__muted}>Правок оценки по этой попытке не было.</li>
        )}
      </ul>
    </Panel>
  );
}
