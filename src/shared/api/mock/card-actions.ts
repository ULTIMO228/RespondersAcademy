/*
 * Действия с карточкой (T1.1-12, T1.1-13): статус ДДС, связи, отработки, напоминания, SMS, записи разговоров.
 * Все POST пишут в in-memory store (store-cards.ts) и видны в последующем GET /api/mock/cards/[id].
 * Существование карточки проверяется для обоих пространств id ("card-*" и "c-NNN") → иначе 404.
 */
import type {
  CardLink,
  CardLinksResponse,
  CardRecording,
  CardReminder,
  CardSms,
  CardStatusEvent,
  CardStatusRequest,
  CardWorkLine,
  DdsStatus,
  IncidentCard,
} from "../types";
import { requireCard } from "./cards";
import { readCards } from "./readers";
import { readJsonBody } from "./request";
import { validationFailed } from "./respond";
import {
  addCardReminder,
  addCardSms,
  addCardStatusEvent,
  addCardWorkLine,
  readCardRuntime,
} from "./store-cards";
import { nowIso, parseIso } from "./time";

/* ─── Последовательность статусов ───────────────────────────────────────────────────────────────── */

/**
 * Проверка перехода статуса ДДС (T1.2-01). shared не импортирует entities: машину статусов
 * (entities/service → createDdsStatusMachine(reference.ddsStatuses).assertTransition) передаёт
 * серверная сборка handler'ов (src/app/mock-api). Бросает StatusTransitionError из @/shared/lib —
 * её статус (409 invalidTransition / 400 validationFailed) назначает toErrorResponse.
 */
export type DdsTransitionGuard = (
  from: DdsStatus | null,
  to: DdsStatus,
  payload: { comment?: string | null },
) => void;

/* ─── Валидация тел запросов ────────────────────────────────────────────────────────────────────── */

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw validationFailed(`Поле «${key}» должно быть строкой`);
  return value.trim() || undefined;
}

function requiredString(body: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(body, key);
  if (!value) throw validationFailed(`Заполните поле «${label}»`);
  return value;
}

/* ─── Статус ДДС ────────────────────────────────────────────────────────────────────────────────── */

function parseStatusRequest(body: Record<string, unknown>): CardStatusRequest {
  if (typeof body.ddsStatus !== "string" || body.ddsStatus.trim() === "") {
    throw validationFailed("Выберите статус из списка доступных");
  }
  const comment = optionalString(body, "comment");
  const dutyNumber = optionalString(body, "dutyNumber");
  const request: CardStatusRequest = { ddsStatus: body.ddsStatus as DdsStatus };
  if (comment) request.comment = comment;
  if (dutyNumber) request.dutyNumber = dutyNumber;
  return request;
}

/**
 * POST /cards/[id]/status — { ddsStatus, comment?, dutyNumber? }. Последовательность, известность статуса
 * и обязательный комментарий (requiresComment) проверяет машина статусов справочника (guard).
 */
export async function postStatus(
  cardId: string,
  httpRequest: Request,
  assertTransition: DdsTransitionGuard,
): Promise<CardStatusEvent> {
  requireCard(cardId);
  const request = parseStatusRequest(await readJsonBody(httpRequest));
  const current = readCardRuntime(cardId).statusEvents.at(-1)?.ddsStatus ?? null;
  assertTransition(current, request.ddsStatus, { comment: request.comment });
  return addCardStatusEvent(cardId, request);
}

/* ─── Связи (read-only проекция duplicateOf) ────────────────────────────────────────────────────── */

function findRootCardId(card: IncidentCard, cards: readonly IncidentCard[]): string {
  const visited = new Set<string>();
  let current: IncidentCard | undefined = card;
  while (current?.duplicateOf && !visited.has(current.id)) {
    visited.add(current.id);
    const parentId: string = current.duplicateOf;
    current = cards.find((candidate) => candidate.id === parentId);
    if (!current) return parentId;
  }
  return current?.id ?? card.id;
}

/**
 * POST /cards/[id]/links — цепочка «главная» (оригинал) + «подчинённые» (дубли, по id).
 * В тренажёре связи read-only: ничего не пишет. Фикстуры "card-*" связей не имеют (расхождение №3) → [].
 */
export function getCardLinks(cardId: string): CardLinksResponse {
  const resolved = requireCard(cardId);
  if (resolved.kind === "fixture") return { cardId, chain: [] };
  const cards = readCards();
  const rootId = findRootCardId(resolved.card, cards);
  const subordinates = cards
    .filter((candidate) => candidate.id !== rootId && findRootCardId(candidate, cards) === rootId)
    .map((candidate): CardLink => ({ cardId: candidate.id, role: "subordinate" }));
  if (subordinates.length === 0) return { cardId, chain: [] };
  return { cardId, chain: [{ cardId: rootId, role: "main" }, ...subordinates] };
}

/* ─── Отработки и напоминания ───────────────────────────────────────────────────────────────────── */

/** Оператор тренажёра по умолчанию (формат фикстур «оп. N»). */
const DEFAULT_OPERATOR = "оп. 1";

/** POST /cards/[id]/worklines — без подтверждающей галочки (confirmed: true) не сохраняется. */
export async function postWorkLine(cardId: string, httpRequest: Request): Promise<CardWorkLine> {
  requireCard(cardId);
  const body = await readJsonBody(httpRequest);
  if (body.confirmed !== true) throw validationFailed("Подтвердите отработку перед сохранением");
  return addCardWorkLine(cardId, {
    operator: optionalString(body, "operator") ?? DEFAULT_OPERATOR,
    at: nowIso(),
    service: requiredString(body, "service", "Служба"),
    calledTo: requiredString(body, "calledTo", "Куда звонили"),
    person: requiredString(body, "person", "ФИО"),
    message: requiredString(body, "message", "Сообщение"),
  });
}

/** POST /cards/[id]/reminders — { text, remindAt (ISO) }. */
export async function postReminder(cardId: string, httpRequest: Request): Promise<CardReminder> {
  requireCard(cardId);
  const body = await readJsonBody(httpRequest);
  const text = requiredString(body, "text", "Текст напоминания");
  const remindAt = requiredString(body, "remindAt", "Время напоминания");
  if (Number.isNaN(parseIso(remindAt))) throw validationFailed("Некорректное время напоминания");
  return addCardReminder(cardId, { text, remindAt });
}

/* ─── SMS и записи разговоров ───────────────────────────────────────────────────────────────────── */

/**
 * GET /cards/[id]/sms — smsList фикстуры (засеян в store как входящие) + отправленные, по времени.
 * Правило ПОВ-112 (02-arm-card.md §14): все СМС с одного АОН попадают в первую карточку этого АОН —
 * поэтому входящие привязаны к карточке-фикстуре, а не размножаются по дублям.
 */
export function listSms(cardId: string): CardSms[] {
  requireCard(cardId);
  return readCardRuntime(cardId).sms.sort((left, right) => parseIso(left.at) - parseIso(right.at));
}

/** POST /cards/[id]/sms — исходящее SMS с меткой времени +03:00. */
export async function postSms(cardId: string, httpRequest: Request): Promise<CardSms> {
  const resolved = requireCard(cardId);
  const body = await readJsonBody(httpRequest);
  const text = requiredString(body, "text", "Текст SMS");
  const phone =
    optionalString(body, "phone") ??
    (resolved.kind === "fixture" ? resolved.card.phones.aon : resolved.card.caller.phone);
  return addCardSms(cardId, { direction: "outgoing", text, phone });
}

/** Длительность записи разговора — «мм:сс». */
export const RECORDING_DURATION_FORMAT = /^\d{2}:[0-5]\d$/;

export function isRecordingDuration(candidate: unknown): candidate is string {
  return typeof candidate === "string" && RECORDING_DURATION_FORMAT.test(candidate);
}

/**
 * GET /cards/[id]/recordings — в моках записей нет (расхождения №3, №6: аудио не поставляется) → честный [].
 * Бинарных файлов не добавляем; появятся данные — audioUrl останется заглушкой, duration — «мм:сс».
 */
export function listRecordings(cardId: string): CardRecording[] {
  requireCard(cardId);
  return [];
}
