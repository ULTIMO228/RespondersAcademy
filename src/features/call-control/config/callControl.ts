import type { CallState, LineStatus } from "../model/types";

/** Подсказки к статусам линии (03-arm-softphone.md «Состав»); подписи — TELEPHONY_STATUS_TITLES. */
export const LINE_STATUS_HINTS: Record<LineStatus, string> = {
  available: "готов к вызовам",
  unavailable: "занят — новые вызовы не маршрутизируются",
  disconnected: "софтфон не зарегистрирован в учебном контуре",
  error: "сбой регистрации/линии",
};

export const CALL_STATE_TITLES: Record<CallState, string> = {
  calling: "Вызов…",
  talking: "Разговор",
  finished: "Завершён",
};

/** Внутренние номера учебного контура — 3–4 знака. */
export const MIN_DIAL_LENGTH = 3;
export const MAX_DIAL_LENGTH = 4;

/** Сообщения панели набора (spec/000-фронт/04-pages/03-arm-softphone.md «Поведение»). */
export const DIAL_MESSAGES = {
  format: "Внутренний номер — 3–4 цифры",
  notFound: "Абонент не найден",
  lineDown: "Линия не готова к вызовам — проверьте статус линии",
  callInProgress: "Завершите текущий вызов",
} as const;

/** Эмуляция гудков: ИИ-абонент снимает трубку через 2 сек после набора. */
export const RING_DELAY_MS = 2000;
/** Шаг обновления таймера разговора. */
export const CALL_TIMER_TICK_MS = 1000;
/** Статусы линии, при которых софтфон не может звонить (не зарегистрирован / сбой). */
export const LINE_DOWN_STATUSES: readonly LineStatus[] = ["disconnected", "error"];

/** Мок-флаг демонстрации сбоя линии: `/arm/phone?mockLine=disconnected|error` (не боевой UI). */
export const MOCK_LINE_PARAM = "mockLine";
export const MOCK_LINE_FAULTS: readonly LineStatus[] = ["disconnected", "error"];

/** Подписи голоса ИИ-абонента (вариативность м/ж, Q&A в8). */
export const VOICE_TITLES = { male: "мужской", female: "женский" } as const;

export const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
