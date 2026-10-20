"use client";

import { useState } from "react";

import { referencePanelApi, LOCKED_TEXT } from "../model/referenceApi";
import type { ReferencePanelApi } from "../model/referenceApi";
import { useReferenceAccess } from "../model/useReferenceAccess";
import { ReferenceBrowser } from "./ReferenceBrowser";

import styles from "./ReferencePanel.module.css";

type ReferenceWindowProps = {
  initialQuery?: string;
  initialArticleId?: string | null;
  api?: ReferencePanelApi;
};

/**
 * Справочник в отдельном окне для второго монитора (спека 005, US3): только поиск и статья, без меню кабинета.
 * Доступ перепроверяется при фокусе и раз в 15 с: начавшаяся попытка с запретом закрывает содержание.
 */
export function ReferenceWindow({
  initialQuery = "",
  initialArticleId = null,
  api = referencePanelApi,
}: ReferenceWindowProps) {
  const { state } = useReferenceAccess(api, true);
  const [query, setQuery] = useState(initialQuery);
  const [articleId, setArticleId] = useState<string | null>(initialArticleId);
  return (
    <main className={styles.window}>
      <h1 className={styles.panel__title}>Справочник</h1>
      {state === "locked" ? (
        <p className={styles.notice} role="alert">
          {LOCKED_TEXT}
        </p>
      ) : (
        <ReferenceBrowser
          api={api}
          query={query}
          onQuery={setQuery}
          articleId={articleId}
          onArticle={setArticleId}
        />
      )}
    </main>
  );
}
