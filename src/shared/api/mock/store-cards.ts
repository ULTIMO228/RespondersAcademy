/*
 * Store: мутации карточек (статусы ДДС, отработки, напоминания, SMS). Id карточки — любого пространства.
 * Проверки существования карточки и бизнес-валидация — в логике эндпоинтов (card-actions.ts), не здесь.
 */
import type {
  CardReminder,
  CardReminderRequest,
  CardRuntimeState,
  CardSms,
  CardStatusEvent,
  CardStatusRequest,
  CardWorkLine,
  SmsDirection,
  WorkLine,
} from "../types";
import { cloneOut, getMockState, MOCK_ID_PREFIX, nextMockId } from "./store";
import { createEmptyCardRuntime } from "./store-seed";
import { nowIso } from "./time";

function ensureCardRuntime(cardId: string): CardRuntimeState {
  const state = getMockState();
  state.cardRuntime[cardId] ??= createEmptyCardRuntime();
  return state.cardRuntime[cardId];
}

/** Копия рантайм-состояния карточки (пустые коллекции, если мутаций не было). */
export function readCardRuntime(cardId: string): CardRuntimeState {
  return cloneOut(getMockState().cardRuntime[cardId] ?? createEmptyCardRuntime());
}

export function addCardStatusEvent(cardId: string, input: CardStatusRequest): CardStatusEvent {
  const event: CardStatusEvent = {
    id: nextMockId(MOCK_ID_PREFIX.statusEvent),
    cardId,
    at: nowIso(),
    ...input,
  };
  ensureCardRuntime(cardId).statusEvents.push(event);
  return cloneOut(event);
}

export function addCardWorkLine(cardId: string, workLine: WorkLine): CardWorkLine {
  const record: CardWorkLine = { id: nextMockId(MOCK_ID_PREFIX.workLine), cardId, ...workLine };
  ensureCardRuntime(cardId).workLines.push(record);
  return cloneOut(record);
}

export function addCardReminder(cardId: string, input: CardReminderRequest): CardReminder {
  const reminder: CardReminder = {
    id: nextMockId(MOCK_ID_PREFIX.reminder),
    cardId,
    text: input.text,
    remindAt: input.remindAt,
    createdAt: nowIso(),
  };
  ensureCardRuntime(cardId).reminders.push(reminder);
  return cloneOut(reminder);
}

export interface CardSmsInput {
  direction: SmsDirection;
  text: string;
  phone?: string;
}

export function addCardSms(cardId: string, input: CardSmsInput): CardSms {
  const sms: CardSms = { id: nextMockId(MOCK_ID_PREFIX.sms), cardId, at: nowIso(), ...input };
  ensureCardRuntime(cardId).sms.push(sms);
  return cloneOut(sms);
}
