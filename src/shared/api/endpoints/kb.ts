/* Справочник — /api/v1/kb (спека 002, contracts/v1-integration.md §4): 105 статей по группам ЕКП. */
import { v1ApiClient } from "../v1-client";
import type { KbArticle, KbArticlePatch, KbArticlesQuery, KbSections } from "../types";

export function listKbArticles(query?: KbArticlesQuery, signal?: AbortSignal): Promise<KbArticle[]> {
  return v1ApiClient.get<KbArticle[]>("/kb/articles", query, signal);
}

export function getKbArticle(articleId: string, signal?: AbortSignal): Promise<KbArticle> {
  return v1ApiClient.get<KbArticle>(`/kb/articles/${encodeURIComponent(articleId)}`, undefined, signal);
}

/** PATCH /kb/articles/{id}: teacher/admin; тело — только { sections } из пяти разделов, запись в аудит kb.update. */
export function updateKbArticle(articleId: string, sections: KbSections): Promise<KbArticle> {
  const body: KbArticlePatch = { sections };
  return v1ApiClient.patch<KbArticle>(`/kb/articles/${encodeURIComponent(articleId)}`, body);
}
