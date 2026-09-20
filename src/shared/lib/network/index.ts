/*
 * Состояние связи с сервером за интерфейсом (spec/10-code-rules.md §6; ТЗ §7 «Сбой сети»).
 * Единое на приложение: события браузера online/offline + явные отметки клиента API
 * (сетевой сбой запроса → offline, успешный запрос/проба → online). В тестах источник подменяется.
 */
export type ConnectivityListener = () => void;

export interface ConnectivitySource {
  /** navigator.onLine на момент вызова (нет navigator — считаем, что связь есть). */
  isOnline(): boolean;
  /** Подписка на события браузера; возвращает отписку. */
  subscribe(listener: ConnectivityListener): () => void;
}

export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: ConnectivityListener): () => void;
  /** Запрос упал по сети — связь потеряна. */
  markOffline(): void;
  /** Запрос/проба прошли — связь восстановлена. */
  markOnline(): void;
}

const NETWORK_EVENTS = ["online", "offline"] as const;

/** Источник из window/navigator; без window (SSR) — всегда online, подписка пустая. */
export const browserConnectivitySource: ConnectivitySource = {
  isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine),
  subscribe: (listener) => {
    if (typeof window === "undefined") return () => undefined;
    NETWORK_EVENTS.forEach((type) => window.addEventListener(type, listener));
    return () => NETWORK_EVENTS.forEach((type) => window.removeEventListener(type, listener));
  },
};

export function createConnectivity(source: ConnectivitySource = browserConnectivitySource): Connectivity {
  const listeners = new Set<ConnectivityListener>();
  let reportedOffline = false;
  let detach: (() => void) | null = null;

  const notify = () => listeners.forEach((listener) => listener());
  const handleBrowserEvent = () => {
    if (source.isOnline()) reportedOffline = false;
    notify();
  };
  const setReported = (value: boolean) => {
    if (reportedOffline === value) return;
    reportedOffline = value;
    notify();
  };

  return {
    isOnline: () => source.isOnline() && !reportedOffline,
    subscribe: (listener) => {
      listeners.add(listener);
      detach ??= source.subscribe(handleBrowserEvent);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
        }
      };
    },
    markOffline: () => setReported(true),
    markOnline: () => setReported(false),
  };
}

/** Состояние связи приложения (одно на вкладку). */
export const appConnectivity: Connectivity = createConnectivity();
