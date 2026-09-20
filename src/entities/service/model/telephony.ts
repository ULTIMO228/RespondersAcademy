/*
 * Статус линии телефонии оператора (spec/04-pages/02-arm-card.md §1; 03-arm-softphone.md; источник п. 1.6, 3.1).
 * Один стор на приложение: карточка (T2.3-02) и софтфон (T2.4-01) читают и меняют одно состояние.
 * Регламент: открытая карточка → автоматически «недоступен»; после закрытия последней карточки «недоступен»
 * держится 10 сек, затем «доступен». Ручное переключение — кликом по статусу (по кругу 4 состояний).
 */
import { systemClock } from "@/shared/lib";
import type { Clock, TimerHandle } from "@/shared/lib";

export type TelephonyStatus = "available" | "unavailable" | "disconnected" | "error";

/** Порядок ручного переключения и подписи — дословно по источнику. */
export const TELEPHONY_STATUSES: readonly TelephonyStatus[] = [
  "available",
  "unavailable",
  "disconnected",
  "error",
];

export const TELEPHONY_STATUS_TITLES: Record<TelephonyStatus, string> = {
  available: "доступен",
  unavailable: "недоступен",
  disconnected: "не подключен",
  error: "ошибка",
};

/** Удержание «недоступен» после закрытия карточки. */
export const CARD_CLOSE_HOLD_MS = 10_000;

/** Технические состояния линии автоматикой карточки не перезаписываются. */
const TECHNICAL_STATUSES: readonly TelephonyStatus[] = ["disconnected", "error"];

export interface TelephonyStore {
  getStatus(): TelephonyStatus;
  subscribe(listener: () => void): () => void;
  /** Ручная установка статуса. */
  setStatus(status: TelephonyStatus): void;
  /** Клик по статусу: следующий по кругу. */
  cycleStatus(): void;
  /** Карточка открыта → «недоступен» (удержание после прошлой карточки отменяется). */
  cardOpened(): void;
  /** Карточка закрыта → через 10 сек «доступен», если открытых карточек не осталось. */
  cardClosed(): void;
}

export function getNextTelephonyStatus(current: TelephonyStatus): TelephonyStatus {
  const index = TELEPHONY_STATUSES.indexOf(current);
  return TELEPHONY_STATUSES[(index + 1) % TELEPHONY_STATUSES.length];
}

export function createTelephonyStore(clock: Clock = systemClock): TelephonyStore {
  const listeners = new Set<() => void>();
  let status: TelephonyStatus = "available";
  let openCards = 0;
  let holdTimer: TimerHandle | null = null;

  const setStatus = (next: TelephonyStatus) => {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  };
  const cancelHold = () => {
    if (holdTimer !== null) clock.clearTimeout(holdTimer);
    holdTimer = null;
  };
  const releaseAfterHold = () => {
    holdTimer = null;
    if (openCards === 0 && status === "unavailable") setStatus("available");
  };

  return {
    getStatus: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setStatus: (next) => {
      cancelHold();
      setStatus(next);
    },
    cycleStatus: () => {
      cancelHold();
      setStatus(getNextTelephonyStatus(status));
    },
    cardOpened: () => {
      openCards += 1;
      cancelHold();
      if (!TECHNICAL_STATUSES.includes(status)) setStatus("unavailable");
    },
    cardClosed: () => {
      openCards = Math.max(0, openCards - 1);
      if (openCards > 0) return;
      cancelHold();
      holdTimer = clock.setTimeout(releaseAfterHold, CARD_CLOSE_HOLD_MS);
    },
  };
}

/** Стор телефонии приложения (один на вкладку). */
export const telephonyStore: TelephonyStore = createTelephonyStore();
