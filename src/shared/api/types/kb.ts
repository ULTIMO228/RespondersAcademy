/* Справочник (база знаний) — контракт /api/v1/kb (спека 002; backend/app/schemas/v1/lobby.py): 105 статей, 5 разделов. */

export interface KbSections {
  signs: string[];
  notification: string[];
  clarify: string[];
  ddsDecision: string[];
  typicalErrors: string[];
}

export interface KbArticle {
  id: string;
  group: string;
  title: string;
  sections: KbSections;
  updatedBy?: string;
  updatedAt?: string;
}

export type KbArticlesQuery = {
  /** Подстрока названия группы без учёта регистра. */
  group?: string;
  /** Поиск по названию и группе. */
  q?: string;
};

/** PATCH /kb/articles/{id}: допускается только тело { sections } (teacher/admin; иначе 403). */
export interface KbArticlePatch {
  sections: KbSections;
}
