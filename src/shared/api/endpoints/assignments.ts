/* Задания и экзамен — /api/v1/assignments (спека 002, contracts/v1-integration.md §1). */
import { v1ApiClient } from "../v1-client";
import type {
  Assignment,
  AssignmentCreateRequest,
  AssignmentDetail,
  AssignmentListQuery,
  CardAttemptResponse,
  OperatorAttempt,
  StartAssignmentResult,
} from "../types";

const assignmentPath = (assignmentId: string) => `/assignments/${encodeURIComponent(assignmentId)}`;

type StartResponse = { attempt: OperatorAttempt | CardAttemptResponse };

function isDdsStart(candidate: OperatorAttempt | CardAttemptResponse): candidate is CardAttemptResponse {
  return "sessionId" in candidate && typeof (candidate as CardAttemptResponse).attempt === "object";
}

/** Вид ответа определяется по форме: у compat-попытки ДДС есть sessionId и вложенный attempt. */
export function toStartResult(response: StartResponse): StartAssignmentResult {
  const { attempt } = response;
  if (isDdsStart(attempt)) {
    return { kind: "dds", sessionId: attempt.sessionId, attempt: attempt.attempt, created: attempt.created };
  }
  return { kind: "operator112", attempt };
}

/** GET /assignments: обучающийся видит только назначенные ему задания; фильтры — для преподавателя. */
export function listAssignments(query?: AssignmentListQuery, signal?: AbortSignal): Promise<Assignment[]> {
  return v1ApiClient.get<Assignment[]>("/assignments", query, signal);
}

/** GET /assignments/{id}: задание + прогресс; чтение применяет истечение лимита времени экзамена. */
export function getAssignment(assignmentId: string, signal?: AbortSignal): Promise<AssignmentDetail> {
  return v1ApiClient.get<AssignmentDetail>(assignmentPath(assignmentId), undefined, signal);
}

/**
 * POST /assignments/{id}/start: выдаёт билет либо возвращает уже открытую попытку (восстановление после перезагрузки,
 * в том числе в экзамене). Единственный способ получить попытку режима 112: GET /operator112/attempts/{id} у бэкенда нет.
 * studentId — только для преподавателя/администратора.
 */
export async function startAssignment(
  assignmentId: string,
  studentId?: string,
): Promise<StartAssignmentResult> {
  const response = await v1ApiClient.post<StartResponse>(
    `${assignmentPath(assignmentId)}/start`,
    studentId ? { studentId } : undefined,
  );
  return toStartResult(response);
}

/** POST /assignments/{id}/finish: только преподаватель/администратор (у обучающегося сервер отвечает 403). */
export function finishAssignment(assignmentId: string): Promise<Assignment> {
  return v1ApiClient.post<Assignment>(`${assignmentPath(assignmentId)}/finish`);
}

/**
 * POST /assignments: только teacher/admin. Ошибки сервера (400 — состав, билеты, параметры; 403 — чужой teacherId) —
 * ApiError с дословным сообщением.
 */
export function createAssignment(body: AssignmentCreateRequest): Promise<Assignment> {
  return v1ApiClient.post<Assignment>("/assignments", body);
}
