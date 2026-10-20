"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { ApiError } from "@/shared/api";
import type { KbArticle } from "@/shared/api";
import {
  highlightParts,
  KB_QUERY_MIN_LENGTH,
  KB_SECTION_ORDER,
  queryStems,
  searchArticles,
} from "@/shared/lib";

import { LOCKED_TEXT } from "../model/referenceApi";
import type { ReferencePanelApi } from "../model/referenceApi";

import styles from "./ReferencePanel.module.css";

const HTTP_FORBIDDEN = 403;
const MAX_RESULTS = 20;

type Load =
  | { status: "loading" }
  | { status: "ready"; articles: KbArticle[] }
  | { status: "locked" }
  | { status: "error" };

type ReferenceBrowserProps = {
  api: ReferencePanelApi;
  query: string;
  onQuery: (query: string) => void;
  articleId: string | null;
  onArticle: (articleId: string | null) => void;
  /** Поле поиска получает фокус при открытии панели. */
  autoFocus?: boolean;
};

function Highlight({ text, stems }: { text: string; stems: string[] }) {
  return (
    <>
      {highlightParts(text, stems).map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

/** Поиск и чтение статей справочника тезисами (спека 005, FR-003/FR-004). Общий для панели в АРМ и отдельного окна. */
export function ReferenceBrowser({
  api,
  query,
  onQuery,
  articleId,
  onArticle,
  autoFocus = false,
}: ReferenceBrowserProps) {
  const inputId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [fresh, setFresh] = useState<KbArticle | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.articles(controller.signal).then(
      (articles) => !controller.signal.aborted && setLoad({ status: "ready", articles }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          status: error instanceof ApiError && error.status === HTTP_FORBIDDEN ? "locked" : "error",
        });
      },
    );
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    setFresh(null);
    if (!articleId) return;
    const controller = new AbortController();
    api.article(articleId, controller.signal).then(
      (article) => !controller.signal.aborted && setFresh(article),
      (error: unknown) => {
        if (!controller.signal.aborted && error instanceof ApiError && error.status === HTTP_FORBIDDEN) {
          setLoad({ status: "locked" });
        }
      },
    );
    return () => controller.abort();
  }, [api, articleId]);

  const stems = useMemo(() => queryStems(query), [query]);
  const hits = useMemo(
    () => (load.status === "ready" ? searchArticles(load.articles, query).slice(0, MAX_RESULTS) : []),
    [load, query],
  );

  if (load.status === "locked")
    return (
      <p className={styles.notice} role="alert">
        {LOCKED_TEXT}
      </p>
    );
  if (load.status === "error")
    return (
      <p className={styles.notice} role="alert">
        Справочник временно недоступен
      </p>
    );
  if (load.status === "loading") return <p className={styles.muted}>Загрузка справочника…</p>;

  const opened = articleId ? (fresh ?? load.articles.find((item) => item.id === articleId) ?? null) : null;
  if (opened) {
    return (
      <article className={styles.article} aria-labelledby={`${inputId}-title`}>
        <button type="button" className={styles.back} onClick={() => onArticle(null)}>
          ← К результатам
        </button>
        <h3 id={`${inputId}-title`} className={styles.article__title}>
          <Highlight text={opened.title} stems={stems} />
        </h3>
        <p className={styles.muted}>{opened.group}</p>
        {KB_SECTION_ORDER.filter(({ key }) => (opened.sections[key] ?? []).length > 0).map(
          ({ key, title }) => (
            <section key={key} className={styles.section}>
              <h4 className={styles.section__title}>{title}</h4>
              <ul className={styles.theses}>
                {opened.sections[key].map((thesis, index) => (
                  <li key={index}>
                    <Highlight text={thesis} stems={stems} />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </article>
    );
  }

  const trimmed = query.trim();
  return (
    <div className={styles.browser}>
      <label className={styles.label} htmlFor={inputId}>
        Поиск по ключевым словам
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder="например: балкон пожар"
        onChange={(event) => onQuery(event.target.value)}
      />
      {trimmed === "" ? (
        <p className={styles.muted}>Введите слова из вызова: что случилось, где, кто пострадал.</p>
      ) : stems.length === 0 ? (
        <p className={styles.muted}>Введите хотя бы {KB_QUERY_MIN_LENGTH} буквы.</p>
      ) : hits.length === 0 ? (
        <p className={styles.muted} role="status">
          Ничего не найдено. Измените запрос или проверьте написание.
        </p>
      ) : (
        <ul className={styles.results} aria-label="Найденные статьи">
          {hits.map(({ article }) => (
            <li key={article.id}>
              <button type="button" className={styles.result} onClick={() => onArticle(article.id)}>
                <span className={styles.result__title}>
                  <Highlight text={article.title} stems={stems} />
                </span>
                <span className={styles.muted}>{article.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
