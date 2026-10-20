/*
 * Карта ошибок — /api/v1/error-map/* и /api/v1/me/focus (спека 003, contracts/error-map-endpoints.md).
 * Раздел работает только с бэкендом: v1ApiClient (requiresServer) переводит пустой 404 в ServerRequiredError (T007, решение D2).
 */
import { buildQuery } from "../client";
import { v1ApiBaseUrl, v1ApiClient } from "../v1-client";
import type {
  ErrorMapGroup,
  ErrorMapJournalResponse,
  ErrorMapMode,
  ErrorMapPeriod,
  ErrorMapResponse,
  ErrorMapSettings,
  ErrorMapStageDetail,
  ErrorMapVerdictRequest,
  MyFocusResponse,
} from "../types";

/** Общие параметры карты (контракт, «Общие параметры запроса»); без них сервер берёт dds и 1m. */
export type ErrorMapQuery = {
  mode?: ErrorMapMode;
  period?: ErrorMapPeriod;
};

/** Параметры ссылки на PDF: scope=student — studentId; scope=group и journal — groupId. */
export type ErrorMapPdfParams = ErrorMapQuery &
  ({ scope: "student"; studentId: string } | { scope: "group" | "journal"; groupId: string });

const groupPath = (groupId: string) => `/error-map/groups/${encodeURIComponent(groupId)}`;
const studentPath = (studentId: string) => `/error-map/students/${encodeURIComponent(studentId)}`;
const stageSegment = (stageId: string) => `/stages/${encodeURIComponent(stageId)}`;

/** GET /error-map/groups: группы, доступные пользователю; у преподавателя без закреплённых групп — пустой список. */
export function listErrorMapGroups(signal?: AbortSignal): Promise<ErrorMapGroup[]> {
  return v1ApiClient.get<ErrorMapGroup[]>("/error-map/groups", undefined, signal);
}

/** GET /error-map/groups/{groupId}: карта группы — этапы, уровни и вывод за выбранные режим и период. */
export function getErrorMapGroup(
  groupId: string,
  query?: ErrorMapQuery,
  signal?: AbortSignal,
): Promise<ErrorMapResponse> {
  return v1ApiClient.get<ErrorMapResponse>(groupPath(groupId), query, signal);
}

/** GET /error-map/groups/{groupId}/stages/{stageId}: разбор этапа для группы. */
export function getErrorMapStage(
  groupId: string,
  stageId: string,
  query?: ErrorMapQuery,
  signal?: AbortSignal,
): Promise<ErrorMapStageDetail> {
  return v1ApiClient.get<ErrorMapStageDetail>(`${groupPath(groupId)}${stageSegment(stageId)}`, query, signal);
}

/** GET /error-map/groups/{groupId}/journal: таблица «обучающиеся × этапы». */
export function getErrorMapJournal(
  groupId: string,
  query?: ErrorMapQuery,
  signal?: AbortSignal,
): Promise<ErrorMapJournalResponse> {
  return v1ApiClient.get<ErrorMapJournalResponse>(`${groupPath(groupId)}/journal`, query, signal);
}

/** GET /error-map/students/{studentId}: карта обучающегося со сравнением с группой. */
export function getErrorMapStudent(
  studentId: string,
  query?: ErrorMapQuery,
  signal?: AbortSignal,
): Promise<ErrorMapResponse> {
  return v1ApiClient.get<ErrorMapResponse>(studentPath(studentId), query, signal);
}

/** GET /error-map/students/{studentId}/stages/{stageId}: разбор этапа для одного обучающегося. */
export function getErrorMapStudentStage(
  studentId: string,
  stageId: string,
  query?: ErrorMapQuery,
  signal?: AbortSignal,
): Promise<ErrorMapStageDetail> {
  return v1ApiClient.get<ErrorMapStageDetail>(
    `${studentPath(studentId)}${stageSegment(stageId)}`,
    query,
    signal,
  );
}

/**
 * PUT /error-map/verdicts: «Согласен / Не согласен» с пояснением. Повторный выбор сервер обновляет, а не дублирует.
 * Тело ответа контрактом не описано — клиент его не читает.
 */
export async function saveErrorMapVerdict(body: ErrorMapVerdictRequest): Promise<void> {
  await v1ApiClient.put<unknown>("/error-map/verdicts", body);
}

/** GET /me/focus: до трёх этапов обучающегося; только роль student, режим выбирает сервер. */
export function getMyFocus(signal?: AbortSignal): Promise<MyFocusResponse> {
  return v1ApiClient.get<MyFocusResponse>("/me/focus", undefined, signal);
}

/** GET /error-map/settings: пороги светофора (администратор). */
export function getErrorMapSettings(signal?: AbortSignal): Promise<ErrorMapSettings> {
  return v1ApiClient.get<ErrorMapSettings>("/error-map/settings", undefined, signal);
}

/**
 * PUT /error-map/settings: изменение порогов (администратор), запись в аудит на сервере; ответ — сохранённые пороги.
 */
export function saveErrorMapSettings(settings: ErrorMapSettings): Promise<ErrorMapSettings> {
  return v1ApiClient.put<ErrorMapSettings>("/error-map/settings", settings);
}

/**
 * URL PDF карты или журнала (GET /error-map/export.pdf). Только собирает адрес: скачивание — обычной ссылкой,
 * сессия передаётся cookie. Права и 400/403/404 проверяет сервер.
 */
export function errorMapPdfUrl(params: ErrorMapPdfParams): string {
  return `${v1ApiBaseUrl}/error-map/export.pdf${buildQuery({ ...params })}`;
}

/** URL Excel-выгрузки (GET /error-map/export.xlsx): те же параметры и права, что у PDF; файл скачивается ссылкой. */
export function errorMapXlsxUrl(params: ErrorMapPdfParams): string {
  return `${v1ApiBaseUrl}/error-map/export.xlsx${buildQuery({ ...params })}`;
}
