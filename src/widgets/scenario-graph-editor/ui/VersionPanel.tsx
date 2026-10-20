"use client";

import { useState } from "react";

import type { AIScenarioVersion } from "@/shared/api";

import type { WorkflowActions } from "../lib/workflow";
import { approvalLabel } from "../lib/workflow";
import { Btn, TextArea } from "./controls";
import type { Notice } from "../model/useGraphEditor";

import styles from "./Editor.module.css";

type VersionPanelProps = {
  version: AIScenarioVersion;
  actions: WorkflowActions;
  dirty: boolean;
  busy: boolean;
  notice: Notice;
  onSave: () => void;
  onSubmit: () => void;
  onReview: (decision: "accept" | "reject", comment: string) => void;
  onPublish: () => void;
  onDerive: (comment: string) => void;
};

/** Процесс версии: статус и кнопки «Сохранить / На проверку / Принять / Отклонить / Опубликовать» по состоянию и правам. */
export function VersionPanel({
  version,
  actions,
  dirty,
  busy,
  notice,
  onSave,
  onSubmit,
  onReview,
  onPublish,
  onDerive,
}: VersionPanelProps) {
  const [comment, setComment] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [deriveComment, setDeriveComment] = useState("");
  return (
    <section className={styles.versions} aria-label="Версия сценария">
      <div className={styles.versions__head}>
        <h3 className={styles.versions__title}>
          Версия {version.version}: <span data-testid="approval-status">{approvalLabel(version)}</span>
        </h3>
        {dirty ? <span className={styles.dirty}>Есть несохранённые изменения</span> : null}
      </div>
      {version.reviewComment ? (
        <p className={styles.muted}>
          Комментарий эксперта{version.reviewedBy ? ` (${version.reviewedBy})` : ""}: {version.reviewComment}
        </p>
      ) : null}
      <div className={styles.versions__buttons}>
        <Btn variant="primary" onClick={onSave} disabled={!actions.canSave || busy}>
          Сохранить
        </Btn>
        {version.approval === "draft" ? (
          <Btn onClick={onSubmit} disabled={!actions.canSubmit || busy}>
            Отправить на проверку
          </Btn>
        ) : null}
        {actions.canPublish ? (
          <Btn variant="primary" onClick={onPublish} disabled={busy}>
            Опубликовать
          </Btn>
        ) : null}
      </div>
      {actions.saveHint ? <p className={styles.muted}>{actions.saveHint}</p> : null}
      {version.approval === "draft" && dirty ? (
        <p className={styles.muted}>Чтобы отправить на проверку, сначала сохраните изменения.</p>
      ) : null}
      {actions.canReview ? (
        <div className={styles.review}>
          <TextArea
            label="Комментарий эксперта (обязателен при отклонении)"
            rows={2}
            value={comment}
            error={rejectError}
            onChange={(event) => {
              setComment(event.target.value);
              setRejectError(null);
            }}
          />
          <div className={styles.versions__buttons}>
            <Btn variant="primary" disabled={busy} onClick={() => onReview("accept", comment)}>
              Принять
            </Btn>
            <Btn
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!comment.trim()) {
                  setRejectError("Укажите причину отклонения");
                  return;
                }
                onReview("reject", comment);
              }}
            >
              Отклонить
            </Btn>
          </div>
        </div>
      ) : null}
      {actions.canDerive ? (
        <div className={styles.review}>
          <TextArea
            label="Комментарий к новой версии (необязательно)"
            rows={2}
            value={deriveComment}
            onChange={(event) => setDeriveComment(event.target.value)}
          />
          <div className={styles.versions__buttons}>
            <Btn
              onClick={() => {
                onDerive(deriveComment);
                setDeriveComment("");
              }}
              disabled={busy}
            >
              Создать новую версию
            </Btn>
          </div>
        </div>
      ) : null}
      {actions.reviewHint ? <p className={styles.muted}>{actions.reviewHint}</p> : null}
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? styles.error : styles.ok}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
