import { apiClient } from "../client";
import type {
  ArmCardFixture,
  CardDetails,
  CardLinksResponse,
  CardRecording,
  CardReminder,
  CardReminderRequest,
  CardSms,
  CardSmsRequest,
  CardStatusEvent,
  CardStatusRequest,
  CardsQuery,
  CardWorkLine,
  CardWorkLineRequest,
  PageResponse,
} from "../types";
import { API_PATHS } from "./paths";

/** GET /cards — список главного экрана (фильтры + page/perPage; множественные — повторными ключами). */
export function getCards(query?: CardsQuery, signal?: AbortSignal): Promise<PageResponse<ArmCardFixture>> {
  return apiClient.get<PageResponse<ArmCardFixture>>(API_PATHS.cards, query, signal);
}

/** GET /cards/[id] — "card-*" → фикстура, "c-NNN" → учебная карточка; + рантайм-мутации из store. */
export function getCard(cardId: string, signal?: AbortSignal): Promise<CardDetails> {
  return apiClient.get<CardDetails>(API_PATHS.card(cardId), undefined, signal);
}

export function postCardStatus(cardId: string, body: CardStatusRequest): Promise<CardStatusEvent> {
  return apiClient.post<CardStatusEvent>(API_PATHS.cardStatus(cardId), body);
}

/** POST /cards/[id]/links — read-only проекция цепочки связей. */
export function postCardLinks(cardId: string): Promise<CardLinksResponse> {
  return apiClient.post<CardLinksResponse>(API_PATHS.cardLinks(cardId));
}

export function postCardWorkline(cardId: string, body: CardWorkLineRequest): Promise<CardWorkLine> {
  return apiClient.post<CardWorkLine>(API_PATHS.cardWorkLines(cardId), body);
}

export function postCardReminder(cardId: string, body: CardReminderRequest): Promise<CardReminder> {
  return apiClient.post<CardReminder>(API_PATHS.cardReminders(cardId), body);
}

export function getCardSms(cardId: string, signal?: AbortSignal): Promise<CardSms[]> {
  return apiClient.get<CardSms[]>(API_PATHS.cardSms(cardId), undefined, signal);
}

export function postCardSms(cardId: string, body: CardSmsRequest): Promise<CardSms> {
  return apiClient.post<CardSms>(API_PATHS.cardSms(cardId), body);
}

/** GET /cards/[id]/recordings — пустой массив, если записей нет («Записей не найдено»). */
export function getCardRecordings(cardId: string, signal?: AbortSignal): Promise<CardRecording[]> {
  return apiClient.get<CardRecording[]>(API_PATHS.cardRecordings(cardId), undefined, signal);
}
