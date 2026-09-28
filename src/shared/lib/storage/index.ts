/*
 * Хранилище «ключ → строка» за интерфейсом (spec/000-фронт/10-code-rules.md §6): cookie браузера,
 * localStorage или память (тесты, SSR). Ошибки доступа (приватный режим, SSR) не пробрасываются.
 */
export interface StorageWriteOptions {
  /** Срок жизни записи, секунды (cookie: Max-Age; прочие реализации игнорируют). */
  maxAgeSeconds?: number;
}

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string, options?: StorageWriteOptions): void;
  remove(key: string): void;
}

/** Минимальный контракт document для cookie-хранилища (подменяется в тестах). */
export interface CookieDocument {
  cookie: string;
}

const COOKIE_SEPARATOR = "; ";
const EXPIRED_MAX_AGE = 0;

function readCookieValue(cookieHeader: string, key: string): string | null {
  const prefix = `${encodeURIComponent(key)}=`;
  const entry = cookieHeader.split(COOKIE_SEPARATOR).find((part) => part.startsWith(prefix));
  if (entry === undefined) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

function writeCookie(target: CookieDocument, key: string, value: string, maxAgeSeconds?: number): void {
  const attributes = ["Path=/", "SameSite=Lax"];
  if (maxAgeSeconds !== undefined) attributes.push(`Max-Age=${maxAgeSeconds}`);
  target.cookie = [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`, ...attributes].join(
    COOKIE_SEPARATOR,
  );
}

function resolveDocument(documentLike?: CookieDocument): CookieDocument | null {
  if (documentLike) return documentLike;
  return typeof document === "undefined" ? null : document;
}

/**
 * Cookie-хранилище (Path=/, SameSite=Lax): значение видно и клиенту, и серверу (cookies() / proxy).
 * Без document (SSR) — ничего не читает и не пишет.
 */
export function createCookieStorage(documentLike?: CookieDocument): KeyValueStorage {
  return {
    get: (key) => {
      const target = resolveDocument(documentLike);
      return target ? readCookieValue(target.cookie, key) : null;
    },
    set: (key, value, options) => {
      const target = resolveDocument(documentLike);
      if (target) writeCookie(target, key, value, options?.maxAgeSeconds);
    },
    remove: (key) => {
      const target = resolveDocument(documentLike);
      if (target) writeCookie(target, key, "", EXPIRED_MAX_AGE);
    },
  };
}

/** Хранилище в памяти — для тестов и серверного рендера. */
export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const entries = new Map(Object.entries(initial));
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
  };
}

/** Обёртка над Web Storage (localStorage/sessionStorage); недоступность хранилища не ломает UI. */
export function createWebStorage(resolveStorage: () => Storage | undefined): KeyValueStorage {
  function safely<T>(action: (storage: Storage) => T, fallback: T): T {
    try {
      const storage = resolveStorage();
      return storage ? action(storage) : fallback;
    } catch {
      return fallback;
    }
  }
  return {
    get: (key) => safely((storage) => storage.getItem(key), null),
    set: (key, value) => safely((storage) => storage.setItem(key, value), undefined),
    remove: (key) => safely((storage) => storage.removeItem(key), undefined),
  };
}
