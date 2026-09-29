/* Зависимости справочника: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { ApiError, getReference, listKbArticles, listMaterials, updateKbArticle } from "@/shared/api";
import type { KbArticle, KbSections, ReferenceData, TrainingMaterial } from "@/shared/api";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

export type ReferenceApi = {
  /** Все статьи базы знаний (105 в пяти разделах); фильтрация — на клиенте. Только с бэкендом. */
  articles: (signal?: AbortSignal) => Promise<KbArticle[]>;
  /** Служебные номера и статусы (работает и без бэкенда — мок-слой). */
  reference: (signal?: AbortSignal) => Promise<ReferenceData>;
  /** Загруженные преподавателем материалы; обучающемуся сервер может отказать — тогда остаются встроенные памятки. */
  materials: (signal?: AbortSignal) => Promise<TrainingMaterial[]>;
  /** Правка разделов статьи: только преподаватель/администратор (обучающемуся сервер отвечает 403). */
  updateArticle: (articleId: string, sections: KbSections) => Promise<KbArticle>;
};

export const referenceApi: ReferenceApi = {
  articles: (signal) => listKbArticles(undefined, signal),
  reference: (signal) => getReference(signal),
  updateArticle: (articleId, sections) => updateKbArticle(articleId, sections),
  materials: async (signal) => {
    try {
      return await listMaterials(signal);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN)
      )
        return [];
      throw error;
    }
  },
};
