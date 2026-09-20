import { CARD_SOURCE_TITLES, MODE_TITLES, SESSION_STATE_TITLES } from "../config/titles";

/* Мок-типы выведены из JSON (string), поэтому подписи ищем по строковому ключу с запасным значением. */
function lookupTitle(titles: Record<string, string>, key: string): string {
  return titles[key] ?? key;
}

export function getModeTitle(mode: string): string {
  return lookupTitle(MODE_TITLES, mode);
}

export function getSessionStateTitle(state: string): string {
  return lookupTitle(SESSION_STATE_TITLES, state);
}

export function getCardSourceTitle(cardSource: string): string {
  return lookupTitle(CARD_SOURCE_TITLES, cardSource);
}
