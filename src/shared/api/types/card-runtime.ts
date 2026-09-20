/*
 * Рантайм-сущности карточки (in-memory store мок-слоя) и контракты эндпоинтов /api/mock/cards/*.
 * В fixtures/arm-cards.json данных для напоминаний/записей/связей нет (расхождение №3) — коллекции
 * наполняются только через POST и изначально пусты (кроме smsList фикстуры).
 */
import type { ArmCardFixture, WorkLine } from "./arm-card";
import type { PageQuery, QueryValue } from "./api";
import type { IncidentCard } from "./incident-card";
import type { DdsStatus } from "./reference";

/** Id карточки любого пространства: "card-*" (фикстура) или "c-NNN" (учебная). */
export type CardId = string;

/** Статусное событие ДДС по карточке (POST /cards/[id]/status). id: "st-…". */
export interface CardStatusEvent {
  id: string;
  cardId: CardId;
  ddsStatus: DdsStatus;
  at: string;
  comment?: string;
  dutyNumber?: string;
}

/** Строка отработки, добавленная в тренажёре. id: "wl-…". */
export interface CardWorkLine extends WorkLine {
  id: string;
  cardId: CardId;
}

/** Напоминание-будильник (01-arm-main.md). id: "rem-…". */
export interface CardReminder {
  id: string;
  cardId: CardId;
  text: string;
  /** Время срабатывания, ISO. */
  remindAt: string;
  createdAt: string;
}

export type SmsDirection = "incoming" | "outgoing";

/** SMS по карточке. Все СМС с одного АОН попадают в первую карточку (02-arm-card.md §14). id: "sms-…". */
export interface CardSms {
  id: string;
  cardId: CardId;
  direction: SmsDirection;
  text: string;
  /** ISO с московским смещением (+03:00). */
  at: string;
  phone?: string;
}

/** Мок-запись разговора (без бинарных файлов: audioUrl — заглушка или null). */
export interface CardRecording {
  id: string;
  cardId: CardId;
  startedAt: string;
  /** Длительность «мм:сс». */
  duration: string;
  title: string;
  audioUrl: string | null;
}

export type CardLinkRole = "main" | "subordinate";

/** Звено read-only цепочки связей (проекция IncidentCard.duplicateOf). */
export interface CardLink {
  cardId: CardId;
  role: CardLinkRole;
}

/** Мутации карточки из store, накладываемые на данные моков при отдаче. */
export interface CardRuntimeState {
  statusEvents: CardStatusEvent[];
  workLines: CardWorkLine[];
  reminders: CardReminder[];
  sms: CardSms[];
}

/** GET /api/mock/cards/[id]: источник выбирается по формату id. */
export type CardDetails =
  | { kind: "fixture"; card: ArmCardFixture; runtime: CardRuntimeState }
  | { kind: "training"; card: IncidentCard; resolvedFixtureId: string | null; runtime: CardRuntimeState };

/** GET /api/mock/cards: базовые фильтры + пагинация; расширенный поиск (T1.2-03/04) — доп. ключи. */
export type CardsQuery = PageQuery & {
  status?: QueryValue;
  type?: string;
  q?: string;
  [filter: string]: QueryValue;
};

export interface CardStatusRequest {
  ddsStatus: DdsStatus;
  comment?: string;
  dutyNumber?: string;
}

export interface CardWorkLineRequest {
  service: string;
  calledTo: string;
  person: string;
  message: string;
  operator?: string;
  /** Подтверждающая галочка — без неё отработка не сохраняется. */
  confirmed: boolean;
}

export interface CardReminderRequest {
  text: string;
  remindAt: string;
}

export interface CardSmsRequest {
  text: string;
  phone?: string;
}

export interface CardLinksResponse {
  cardId: CardId;
  chain: CardLink[];
}
