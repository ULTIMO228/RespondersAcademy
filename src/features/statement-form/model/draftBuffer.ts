/*
 * Буфер черновика «Действия диспетчера» (T2.3-09, ТЗ §7 «Сбой сети»): поля ввода переживают перезагрузку
 * и сбой связи. Ключ привязан к обучающемуся и карточке; формат — JSON с версией.
 */
import { DRAFT_KEY_PREFIX } from "../config/constants";

export type DraftFields = Record<string, string>;

export type StatementDraft = {
  fields: DraftFields;
  /** Время последней записи, мс с эпохи. */
  savedAt: number;
};

const DRAFT_VERSION = 1;

type SerializedDraft = StatementDraft & { version: number };

export function draftStorageKey(cardId: string, studentId: string): string {
  return `${DRAFT_KEY_PREFIX}:${studentId}:${cardId}`;
}

export function serializeDraft(draft: StatementDraft): string {
  const payload: SerializedDraft = { version: DRAFT_VERSION, ...draft };
  return JSON.stringify(payload);
}

function isDraftFields(candidate: unknown): candidate is DraftFields {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return false;
  return Object.values(candidate).every((value) => typeof value === "string");
}

/** Разбор буфера: мусор, чужая версия или битый JSON → null (черновик не восстанавливается). */
export function parseDraft(raw: string | null): StatementDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedDraft>;
    if (parsed.version !== DRAFT_VERSION || !isDraftFields(parsed.fields)) return null;
    return { fields: parsed.fields, savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0 };
  } catch {
    return null;
  }
}
