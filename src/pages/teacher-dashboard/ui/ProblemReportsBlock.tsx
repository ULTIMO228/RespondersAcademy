"use client";

import { useState } from "react";

import { ApiError } from "@/shared/api";
import type { ProblemReport } from "@/shared/api";
import { Card, EmptyState, PlatformButton, ResourceView, Tag, useResource } from "@/shared/ui/platform";

import { teacherProblemReportsApi } from "../api/problemReportsApi";
import type { ProblemReportsApi } from "../api/problemReportsApi";

import styles from "./ProblemReportsBlock.module.css";

type Props = { api?: ProblemReportsApi };

const MARK_FAILED_MESSAGE = "Не удалось отметить сообщение. Повторите попытку";

function formatMoment(iso: string): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return "—";
  return moment.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Новые сверху: сервер отдаёт в том же порядке, сортировка здесь — страховка при равных метках. */
function newestFirst(items: ProblemReport[]): ProblemReport[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * «Сообщения о проблемах» (спека 009, FR-030): сообщения учеников закреплённых групп от «Сообщить о проблеме».
 * Блок независим от сводки и мониторинга: ошибка или «нужен сервер» остаются внутри карточки. Отметка прочтения
 * обновляет строку на месте; вложение открывается в новой вкладке (тот же origin, cookie сессии уходит сама).
 */
export function ProblemReportsBlock({ api = teacherProblemReportsApi }: Props) {
  const reports = useResource((signal) => api.list(signal), [api]);
  const [readMarks, setReadMarks] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  async function markRead(reportId: string) {
    setPendingId(reportId);
    setMarkError(null);
    try {
      const updated = await api.markRead(reportId);
      setReadMarks((marks) => ({ ...marks, [reportId]: updated.readAt ?? new Date().toISOString() }));
    } catch (error) {
      setMarkError(error instanceof ApiError && error.message ? error.message : MARK_FAILED_MESSAGE);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className={styles.block}>
      <Card title="Сообщения о проблемах" aria-label="Сообщения о проблемах">
        <ResourceView state={reports.state} onRetry={reports.reload} skeletonLines={3}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState
                title="Сообщений нет"
                text="Обучающиеся закреплённых групп пока ничего не отправляли."
              />
            ) : (
              <>
                <ol className={styles.list} aria-label="Сообщения обучающихся">
                  {newestFirst(items).map((report) => {
                    const readAt = readMarks[report.id] ?? report.readAt;
                    return (
                      <li key={report.id} className={styles.item} data-unread={readAt ? "false" : "true"}>
                        <div className={styles.head}>
                          <span className={styles.sender}>{report.studentName}</span>
                          {report.groupId ? <Tag>{report.groupId}</Tag> : null}
                          {readAt ? null : <Tag tone="danger">Новое</Tag>}
                          <time className={styles.time} dateTime={report.createdAt}>
                            {formatMoment(report.createdAt)}
                          </time>
                        </div>
                        <p className={styles.meta}>
                          {report.incidentNumber !== undefined
                            ? `Происшествие ${report.incidentNumber}`
                            : "Без происшествия"}
                          {report.attemptId ? ` · попытка ${report.attemptId}` : ""}
                        </p>
                        <p className={styles.text}>{report.text}</p>
                        <div className={styles.actions}>
                          {report.hasAttachment ? (
                            <a
                              className={styles.link}
                              href={api.attachmentUrl(report.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Открыть вложение
                            </a>
                          ) : null}
                          {readAt ? (
                            <span className={styles.readMark}>Прочитано {formatMoment(readAt)}</span>
                          ) : (
                            <PlatformButton
                              onClick={() => markRead(report.id)}
                              disabled={pendingId === report.id}
                            >
                              Отметить прочитанным
                            </PlatformButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {markError ? (
                  <p className={styles.error} role="alert">
                    {markError}
                  </p>
                ) : null}
              </>
            )
          }
        </ResourceView>
      </Card>
    </div>
  );
}
