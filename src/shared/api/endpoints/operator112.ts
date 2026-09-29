/*
 * Режим «Специалист-112» — /api/v1 (спека 002, contracts/v1-integration.md §2–3).
 * Выдачи попытки здесь нет: она идёт через assignments.startAssignment (в экзамене прямой POST /operator112/attempts даёт 409).
 * Сообщения об ошибках — русский текст сервера, показывается как есть (ApiError.message).
 */
import { v1ApiBaseUrl, v1ApiClient } from "../v1-client";
import type {
  CardDraft,
  ChainSubmitReview,
  IncidentCard,
  NotificationListPreview,
  NotificationListResponse,
  OperatorAttempt,
  OperatorEvaluation,
  OperatorEvent,
  OperatorEventRequest,
  Street,
  TicketAudio,
} from "../types";

/** Подсказка адреса — от 3 символов (бэкенд иначе 400); клиент короткий запрос не отправляет. */
export const STREET_QUERY_MIN_LENGTH = 3;
/** Сообщение о запрете повторного прослушивания в экзамене (ответ 409 файла записи). */
export const EXAM_REPLAY_DENIED_MESSAGE = "Повторное прослушивание в экзамене запрещено";

export interface SubmitAttemptResult {
  attempt: OperatorAttempt;
  card: IncidentCard;
  /** Совпадает с id попытки. */
  evaluationId: string;
  /** Только задание chain: вход ДДС ждёт подтверждения преподавателя. */
  chainReview?: ChainSubmitReview;
}

const attemptPath = (attemptId: string) => `/operator112/attempts/${encodeURIComponent(attemptId)}`;
const ticketPath = (cardId: string) => `/tickets/${encodeURIComponent(cardId)}`;

/** POST …/answer: идемпотентно; при превышении норматива в events появляется answerTimeout. */
export function answerAttempt(attemptId: string): Promise<OperatorAttempt> {
  return v1ApiClient.post<OperatorAttempt>(`${attemptPath(attemptId)}/answer`);
}

/** POST …/events: время события проставляет сервер. */
export function sendAttemptEvent(attemptId: string, event: OperatorEventRequest): Promise<OperatorEvent> {
  return v1ApiClient.post<OperatorEvent>(`${attemptPath(attemptId)}/events`, {
    type: event.type,
    payload: event.payload ?? {},
  });
}

/**
 * GET …/notification-list: без параметров — по событиям попытки; signs/classifierCode — предпросмотр до фиксации событий.
 * Пересчёт ЕКП выполняет сервер, фронт логику не воспроизводит.
 */
export function getNotificationList(
  attemptId: string,
  preview?: NotificationListPreview,
  signal?: AbortSignal,
): Promise<NotificationListResponse> {
  return v1ApiClient.get<NotificationListResponse>(
    `${attemptPath(attemptId)}/notification-list`,
    { signs: preview?.signs, classifierCode: preview?.classifierCode },
    signal,
  );
}

/** POST …/submit: 400 — «Заполните адресный блок» / «Заполните описание…»; 409 — «Карточка уже отправлена». */
export function submitAttempt(attemptId: string, draft: CardDraft): Promise<SubmitAttemptResult> {
  return v1ApiClient.post<SubmitAttemptResult>(`${attemptPath(attemptId)}/submit`, draft);
}

/** GET …/evaluation: до передачи карточки сервер отвечает 404. */
export function getOperatorEvaluation(attemptId: string, signal?: AbortSignal): Promise<OperatorEvaluation> {
  return v1ApiClient.get<OperatorEvaluation>(`${attemptPath(attemptId)}/evaluation`, undefined, signal);
}

/** GET /streets: улицы справочника; запрос короче 3 символов не уходит на сервер. */
export async function searchStreets(query: string, limit?: number, signal?: AbortSignal): Promise<Street[]> {
  const trimmed = query.trim();
  if (trimmed.length < STREET_QUERY_MIN_LENGTH) return [];
  return v1ApiClient.get<Street[]>("/streets", { q: trimmed, limit }, signal);
}

/** GET /tickets/{cardId}/audio: статус записи и расшифровка (аварийный режим — emergency). */
export function getTicketAudio(cardId: string, signal?: AbortSignal): Promise<TicketAudio> {
  return v1ApiClient.get<TicketAudio>(`${ticketPath(cardId)}/audio`, undefined, signal);
}

/** Адрес файла записи. Не подставлять в <audio src>: в экзамене каждый запрос файла (в т.ч. Range) — учтённое прослушивание. */
export function ticketAudioFileUrl(cardId: string): string {
  return `${v1ApiBaseUrl}${ticketPath(cardId)}/audio/file`;
}

/**
 * GET …/audio/file одним запросом → Blob для воспроизведения (URL.createObjectURL).
 * 404 «аудио не готово» и любые отказы, кроме 409 экзамена, ведут в аварийный текстовый режим; 409 → EXAM_REPLAY_DENIED_MESSAGE.
 */
export function fetchTicketAudioFile(cardId: string, signal?: AbortSignal): Promise<Blob> {
  return v1ApiClient.getBlob(`${ticketPath(cardId)}/audio/file`, signal);
}
