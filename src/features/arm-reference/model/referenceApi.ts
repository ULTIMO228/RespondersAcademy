/* Зависимости панели справочника за интерфейсом (в тестах подменяются целиком). */
import { getKbArticle, getReferenceAccess, listKbArticles } from "@/shared/api";
import type { KbArticle, ReferenceAccess } from "@/shared/api";

export type ReferencePanelApi = {
  access: (signal?: AbortSignal) => Promise<ReferenceAccess>;
  articles: (signal?: AbortSignal) => Promise<KbArticle[]>;
  /** Свежая версия статьи при открытии: правки преподавателя видны сразу (FR-005). */
  article: (articleId: string, signal?: AbortSignal) => Promise<KbArticle>;
};

export const referencePanelApi: ReferencePanelApi = {
  access: (signal) => getReferenceAccess(signal),
  articles: (signal) => listKbArticles(undefined, signal),
  article: (articleId, signal) => getKbArticle(articleId, signal),
};

export const LOCKED_TEXT = "Справочник недоступен в этом задании";
