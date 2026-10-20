/*
 * «Сообщить о проблеме» — /api/v1/problem-reports (ученик), /api/v1/teacher/problem-reports/* (преподаватель; спека 009,
 * US6). Только с бэкендом: v1ApiClient (requiresServer) переводит пустой 404 в ServerRequiredError.
 */
import { v1ApiBaseUrl, v1ApiClient } from "../v1-client";
import type { ProblemReport, ProblemReportList } from "../types";

/** Черновик сообщения из окна ученика; вложение — png/jpeg ≤ 2 МБ (проверяет окно и сервер). */
export type ProblemReportDraft = {
  text: string;
  attemptId?: string;
  incidentNumber?: number;
  attachment?: File | null;
};

const reportPath = (reportId: string) => `/teacher/problem-reports/${encodeURIComponent(reportId)}`;

/** Поля multipart так, как их ждёт сервер: text, attemptId, incidentNumber, attachment (необязательные — только если заданы). */
export function buildProblemReportForm(draft: ProblemReportDraft): FormData {
  const form = new FormData();
  form.append("text", draft.text);
  if (draft.attemptId) form.append("attemptId", draft.attemptId);
  if (draft.incidentNumber !== undefined) form.append("incidentNumber", String(draft.incidentNumber));
  if (draft.attachment) form.append("attachment", draft.attachment, draft.attachment.name);
  return form;
}

/** POST /problem-reports (multipart): 201 → ProblemReport без пути к файлу; 403 — не ученик; 400 — текст или файл. */
export function createProblemReport(form: FormData, signal?: AbortSignal): Promise<ProblemReport> {
  return v1ApiClient.postForm<ProblemReport>("/problem-reports", form, signal);
}

/** GET /teacher/problem-reports: сообщения обучающихся закреплённых групп, новые сверху. */
export async function listTeacherProblemReports(signal?: AbortSignal): Promise<ProblemReport[]> {
  const response = await v1ApiClient.get<ProblemReportList>("/teacher/problem-reports", undefined, signal);
  return response.items;
}

/** POST …/read: отметка прочтения; повторный вызов не меняет время первой отметки. */
export function markProblemReportRead(reportId: string, signal?: AbortSignal): Promise<ProblemReport> {
  return v1ApiClient.post<ProblemReport>(`${reportPath(reportId)}/read`, undefined, signal);
}

/** Ссылка на вложение (GET …/attachment, same-origin: cookie сессии уходит сама). Чужая группа — 404. */
export function problemReportAttachmentUrl(reportId: string): string {
  return `${v1ApiBaseUrl}${reportPath(reportId)}/attachment`;
}
