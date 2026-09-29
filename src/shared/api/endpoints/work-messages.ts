/* Сообщения о ходе работ и голосовой доклад этапа ДДС — /api/v1/attempts/{id}/… (спека 002, contracts/v1-integration.md §5). */
import { v1ApiClient } from "../v1-client";
import type { ReportAudioResponse, WorkMessage } from "../types";

const attemptPath = (attemptId: string) => `/attempts/${encodeURIComponent(attemptId)}`;

/**
 * GET …/work-messages?since=<ISO>: только наступившие сообщения (at ≤ now, at > since) по возрастанию; пусто, если занятие не
 * включило сообщения. Для попытки не режима ДДС сервер отвечает 404.
 */
export function listWorkMessages(
  attemptId: string,
  since?: string,
  signal?: AbortSignal,
): Promise<WorkMessage[]> {
  return v1ApiClient.get<WorkMessage[]>(`${attemptPath(attemptId)}/work-messages`, { since }, signal);
}

/**
 * POST …/report-audio (multipart): WAV моно PCM 16 бит 8/16 кГц ≤ 20 МБ. 400 — формат/пустая речь/адресат, 503 — нет модели
 * распознавания речи (Vosk): остальные функции карточки работают.
 */
export function postReportAudio(
  attemptId: string,
  wav: Blob,
  toNumber = "112",
  signal?: AbortSignal,
): Promise<ReportAudioResponse> {
  const form = new FormData();
  form.append("file", wav, "report.wav");
  form.append("to_number", toNumber);
  return v1ApiClient.postForm<ReportAudioResponse>(`${attemptPath(attemptId)}/report-audio`, form, signal);
}
