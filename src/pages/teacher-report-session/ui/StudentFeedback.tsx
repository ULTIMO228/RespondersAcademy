"use client";

import { useState } from "react";

import { formatDateTime } from "@/shared/lib";
import { AiBadge, Button, Panel, Select } from "@/shared/ui";

import type { FeedbackTarget } from "../model/types";

import styles from "./ReportSession.module.css";

export type FeedbackDraft = { text: string; recommendations: string[] };

type StudentFeedbackProps = {
  targets: FeedbackTarget[];
  onSend: (reportId: string, draft: FeedbackDraft) => Promise<void>;
};

const EMPTY_TEXT = "Комментарий к результату не может быть пустым";

/** 5. Обратная связь курсанту: комментарий + рекомендации → «Прогресс» курсанта (`/arm/progress`). */
export function StudentFeedback({ targets, onSend }: StudentFeedbackProps) {
  const [reportId, setReportId] = useState(targets[0]?.reportId ?? "");
  const [text, setText] = useState(targets[0]?.sentText ?? targets[0]?.aiComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setSending] = useState(false);
  const target = targets.find((item) => item.reportId === reportId) ?? targets[0];
  if (!target) return null;

  const selectTarget = (nextId: string) => {
    const next = targets.find((item) => item.reportId === nextId);
    setReportId(nextId);
    setError(null);
    setText(next?.sentText ?? next?.aiComment ?? "");
  };

  const handleSend = async () => {
    if (!text.trim()) {
      setError(EMPTY_TEXT);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSend(target.reportId, { text: text.trim(), recommendations: target.recommendations });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : EMPTY_TEXT);
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel title="5. Обратная связь курсанту" headerTone="dark">
      <Select
        label="Курсант"
        value={target.reportId}
        onChange={(event) => selectTarget(event.target.value)}
        options={targets.map((item) => ({ value: item.reportId, label: item.fullName }))}
      />
      <label className={styles.report__label}>
        Комментарий к результату
        <textarea
          className={styles.report__textarea}
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p className={styles.report__label}>
        Рекомендации по улучшению{" "}
        <AiBadge title="Черновик рекомендаций подготовлен ИИ-модулем, правит преподаватель" />
      </p>
      <ul className={styles.report__recommendations}>
        {target.recommendations.map((recommendation) => (
          <li key={recommendation}>{recommendation}</li>
        ))}
      </ul>
      {error ? (
        <p className={styles.report__error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.report__feedbackActions}>
        <Button variant="primary" onClick={handleSend} disabled={isSending}>
          {isSending ? "Отправка…" : "Отправить курсанту"}
        </Button>
        {target.sentAt ? (
          <span role="status" className={styles.report__sent}>
            Отправлено в «Прогресс» курсанта {formatDateTime(target.sentAt)}
            {target.sentBy ? `, ${target.sentBy}` : ""}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
