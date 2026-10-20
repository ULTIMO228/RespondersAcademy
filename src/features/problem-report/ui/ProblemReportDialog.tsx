"use client";

import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { ApiError, buildProblemReportForm, createProblemReport } from "@/shared/api";
import type { ProblemReport } from "@/shared/api";
import { Button, Modal } from "@/shared/ui";

import { ATTACHMENT_TYPES, attachmentError } from "../model/attachment";

import styles from "./ProblemReportDialog.module.css";

export type ProblemReportDialogProps = {
  /** «Отправитель»: ФИО обучающегося и служебные данные рабочего места (как в ИНСТРУКЦИЯ_104). */
  senderName: string;
  /** «Происшествие»: номер карточки; без значения — прочерк. */
  incidentNumber?: number | string;
  /** Попытка 112, из которой открыто окно; уходит на сервер и попадает в сообщение преподавателю. */
  attemptId?: string;
  /** «Время обращения»: ISO-метка; без значения — момент открытия окна. */
  appealAt?: string;
  onClose: () => void;
  /** Вызывается после успешной отправки (до `onClose`). */
  onSent?: (report: ProblemReport) => void;
  /** Подмена отправки (тесты); по умолчанию — POST /api/v1/problem-reports. */
  submit?: (form: FormData) => Promise<ProblemReport>;
};

const TEXT_MAX_LENGTH = 2000;
const SEND_FAILED_MESSAGE = "Не удалось отправить сообщение. Повторите попытку";
const MOSCOW = { timeZone: "Europe/Moscow" } as const;

/** Формат ARM: «18.09.2018 в 18:41:46» (часовой пояс — Москва, как у всей системы). */
export function formatAppealTime(iso: string): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return "—";
  const date = moment.toLocaleDateString("ru-RU", {
    ...MOSCOW,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = moment.toLocaleTimeString("ru-RU", {
    ...MOSCOW,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date} в ${time}`;
}

function normalizeIncident(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

/**
 * «Сообщить о проблеме» (ИНСТРУКЦИЯ_104): белое окно АРМ поверх затемнения. Поля — отправитель, происшествие, время
 * обращения, текст и необязательное изображение (png/jpeg ≤ 2 МБ). «Отправить» — до преподавателя группы; «Отменить»
 * закрывает окно без отправки. Ошибка отправки остаётся в окне, введённый текст не теряется.
 */
export function ProblemReportDialog({
  senderName,
  incidentNumber,
  attemptId,
  appealAt,
  onClose,
  onSent,
  submit = createProblemReport,
}: ProblemReportDialogProps) {
  const [openedAt] = useState(() => new Date().toISOString());
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputId = useId();
  const textId = useId();
  const incidentLabel = incidentNumber === undefined || incidentNumber === "" ? "—" : String(incidentNumber);
  const canSend = text.trim().length > 0 && fileError === null && !sending;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    /* Сброс значения поля: тот же файл можно выбрать снова после ошибки. */
    event.target.value = "";
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = attachmentError(picked);
    setFile(problem ? null : picked);
    setFileError(problem);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const report = await submit(
        buildProblemReportForm({
          text: text.trim(),
          attemptId,
          incidentNumber: normalizeIncident(incidentNumber),
          attachment: file,
        }),
      );
      onSent?.(report);
      onClose();
    } catch (failure) {
      setSendError(failure instanceof ApiError && failure.message ? failure.message : SEND_FAILED_MESSAGE);
      setSending(false);
    }
  }

  return (
    <Modal title="Сообщить о проблеме" onClose={onClose} width={520}>
      <form className={styles.form} onSubmit={handleSubmit} aria-label="Сообщить о проблеме">
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Отправитель</dt>
            <dd>{senderName}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Происшествие</dt>
            <dd>{incidentLabel}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Время обращения</dt>
            <dd>{formatAppealTime(appealAt ?? openedAt)}</dd>
          </div>
        </dl>

        <label className={styles.visuallyHidden} htmlFor={textId}>
          Текст сообщения
        </label>
        <textarea
          id={textId}
          className={styles.text}
          value={text}
          maxLength={TEXT_MAX_LENGTH}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          disabled={sending}
        />
        <p className={styles.counter}>
          {text.length} / {TEXT_MAX_LENGTH}
        </p>

        <div className={styles.attachment}>
          <input
            id={fileInputId}
            className={styles.fileInput}
            type="file"
            accept={ATTACHMENT_TYPES.join(",")}
            onChange={handleFileChange}
            disabled={sending}
            aria-describedby={fileError ? `${fileInputId}-error` : undefined}
          />
          <label className={styles.attachButton} htmlFor={fileInputId}>
            Прикрепить изображение
          </label>
          {file ? (
            <span className={styles.chip}>
              <span className={styles.chipName}>{file.name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Убрать вложение ${file.name}`}
                onClick={() => setFile(null)}
                disabled={sending}
              >
                ×
              </button>
            </span>
          ) : null}
          {fileError ? (
            <p id={`${fileInputId}-error`} className={styles.error} role="alert">
              {fileError}
            </p>
          ) : null}
        </div>

        {sendError ? (
          <p className={styles.error} role="alert">
            {sendError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Отменить
          </Button>
          <Button variant="primary" type="submit" disabled={!canSend}>
            Отправить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
