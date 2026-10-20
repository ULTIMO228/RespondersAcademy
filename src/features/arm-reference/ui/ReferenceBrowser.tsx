"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

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
import { BackIcon, CloseIcon, SearchIcon } from "./icons";

import styles from "./ReferencePanel.module.css";

const HTTP_FORBIDDEN = 403;
const MAX_RESULTS = 20;
/** Примеры запросов под полем поиска (проверены на 105 статьях: у каждого есть результат). Это слова поиска, не содержание. */
const EXAMPLE_QUERIES = ["пожар", "запах газа", "балкон", "взрыв", "лифт", "ребёнок", "драка", "оружие"];

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

/** Первый тезис, где встретилось слово запроса: показывается под названием, чтобы не открывать каждую статью. */
function snippetOf(article: KbArticle, stems: string[]): string | null {
  for (const { key } of KB_SECTION_ORDER) {
    const found = (article.sections[key] ?? []).find((thesis) =>
      highlightParts(thesis, stems).some((part) => part.match),
    );
    if (found) return found;
  }
  return null;
}

/** Поиск и чтение статей справочника тезисами (спека 016, FR-003/FR-004). Общий для окошка в АРМ и отдельного окна. */
export function ReferenceBrowser({
  api,
  query,
  onQuery,
  articleId,
  onArticle,
  autoFocus = false,
}: ReferenceBrowserProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
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
          <BackIcon />К результатам
        </button>
        <header className={styles.article__head}>
          <span className={styles.tag}>{opened.group}</span>
          <h3 id={`${inputId}-title`} className={styles.article__title}>
            <Highlight text={opened.title} stems={stems} />
          </h3>
        </header>
        {KB_SECTION_ORDER.filter(({ key }) => (opened.sections[key] ?? []).length > 0).map(
          ({ key, title }) => (
            <section key={key} className={styles.section} data-section={key}>
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
  const resultButtons = () =>
    Array.from(resultsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      resultButtons()[0]?.focus();
    }
  };
  const onResultsKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = resultButtons();
    const index = buttons.findIndex((button) => button === document.activeElement);
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) inputRef.current?.focus();
    else buttons[Math.min(next, buttons.length - 1)]?.focus();
  };

  return (
    <div className={styles.browser}>
      <label className={styles.label} htmlFor={inputId}>
        Поиск по ключевым словам
      </label>
      <div className={styles.search}>
        <span className={styles.search__icon} aria-hidden="true">
          <SearchIcon size={18} />
        </span>
        <input
          id={inputId}
          ref={inputRef}
          className={styles.input}
          type="search"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="например: балкон пожар"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onInputKey}
        />
        {query !== "" ? (
          <button
            type="button"
            className={styles.search__clear}
            aria-label="Очистить поиск"
            onClick={() => {
              onQuery("");
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>
      {trimmed === "" ? (
        <>
          <p className={styles.muted}>Введите слова из вызова: что случилось, где, кто пострадал.</p>
          <div className={styles.suggest}>
            <p className={styles.suggest__title}>Попробуйте найти</p>
            <ul className={styles.chips} aria-label="Примеры запросов">
              {EXAMPLE_QUERIES.map((example) => (
                <li key={example}>
                  <button type="button" className={styles.chip} onClick={() => onQuery(example)}>
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : stems.length === 0 ? (
        <p className={styles.muted}>Введите хотя бы {KB_QUERY_MIN_LENGTH} буквы.</p>
      ) : hits.length === 0 ? (
        <p className={styles.muted} role="status">
          Ничего не найдено. Измените запрос или проверьте написание.
        </p>
      ) : (
        <>
          <p className={styles.count} role="status">
            Найдено статей: {hits.length}
          </p>
          <ul
            className={styles.results}
            aria-label="Найденные статьи"
            ref={resultsRef}
            onKeyDown={onResultsKey}
          >
            {hits.map(({ article }) => {
              const snippet = snippetOf(article, stems);
              return (
                <li key={article.id}>
                  <button type="button" className={styles.result} onClick={() => onArticle(article.id)}>
                    <span className={styles.result__title}>
                      <Highlight text={article.title} stems={stems} />
                    </span>
                    {snippet ? (
                      <span className={styles.result__snippet}>
                        <Highlight text={snippet} stems={stems} />
                      </span>
                    ) : null}
                    <span className={styles.tag}>{article.group}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
