"use client";

import { useState } from "react";

import type { KbArticle } from "@/shared/api";
import { Alert, Card, EmptyState, PlatformButton, SelectField } from "@/shared/ui/platform";

import { filterArticles } from "../lib/search";
import { ArticleEditor } from "./ArticleEditor";
import styles from "./Reference.module.css";

const SECTION_TITLES: [keyof KbArticle["sections"], string][] = [
  ["signs", "Признаки происшествия"],
  ["notification", "Оповещение служб"],
  ["clarify", "Что уточнить у заявителя"],
  ["ddsDecision", "Решение диспетчера ДДС"],
  ["typicalErrors", "Типичные ошибки"],
];

type ArticlesTabProps = {
  articles: KbArticle[];
  query: string;
  /** Статья, открытая по ссылке из рекомендации или поиска. */
  initialArticleId?: string;
  /** Преподаватель и администратор правят разделы статьи; у обучающегося кнопки нет. */
  canEdit?: boolean;
  /** Сохранение разделов; отказ сервера (403/400) — ошибка с дословным сообщением. */
  onSave?: (articleId: string, sections: KbArticle["sections"]) => Promise<KbArticle>;
};

/** Статьи базы знаний: список слева (поиск и группа), статья справа — пять разделов. Редактирование обучающемуся недоступно. */
export function ArticlesTab({
  articles: source,
  query,
  initialArticleId,
  canEdit = false,
  onSave,
}: ArticlesTabProps) {
  const [group, setGroup] = useState("");
  const [saved, setSaved] = useState<Record<string, KbArticle>>({});
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const articles = source.map((article) => saved[article.id] ?? article);
  const [selectedId, setSelectedId] = useState(initialArticleId ?? "");
  const groups = [...new Set(articles.map((article) => article.group))].sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  const visible = filterArticles(articles, query, group);
  const selected = visible.find((article) => article.id === selectedId) ?? visible[0];

  return (
    <>
      <div className={styles.search}>
        <SelectField
          label="Группа происшествий"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">Все группы ({groups.length})</option>
          {groups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
      </div>
      {visible.length === 0 ? (
        <Card>
          <EmptyState title="Статьи не найдены" text="Измените запрос или выберите другую группу." />
        </Card>
      ) : (
        <div className={styles.layout}>
          <Card aria-label="Список статей">
            <ul className={styles.list}>
              {visible.map((article) => (
                <li key={article.id}>
                  <button
                    type="button"
                    className={styles.list__button}
                    aria-current={article.id === selected?.id ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(article.id);
                      setEditing(false);
                      setNotice(null);
                    }}
                  >
                    <span>{article.title}</span>
                    <span className={styles.list__group}>{article.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {selected ? (
            <Card
              aria-label={`Статья: ${selected.title}`}
              actions={
                canEdit && onSave && !editing ? (
                  <PlatformButton variant="secondary" onClick={() => setEditing(true)}>
                    Править разделы
                  </PlatformButton>
                ) : undefined
              }
            >
              {notice ? <Alert tone="success">{notice}</Alert> : null}
              {editing && onSave ? (
                <ArticleEditor
                  key={selected.id}
                  article={selected}
                  onCancel={() => setEditing(false)}
                  onSave={async (sections) => {
                    const updated = await onSave(selected.id, sections);
                    setSaved((current) => ({ ...current, [selected.id]: updated }));
                    setEditing(false);
                    setNotice("Изменения сохранены и видны обучающимся.");
                  }}
                />
              ) : (
                <article>
                  <div className={styles.article__group}>{selected.group}</div>
                  <h2 className={styles.article__title}>{selected.title}</h2>
                  {SECTION_TITLES.map(([key, title]) => (
                    <section key={key} aria-label={title}>
                      <h3 className={styles["article__section-title"]}>{title}</h3>
                      {selected.sections[key].length === 0 ? (
                        <p className={styles.muted}>Раздел не заполнен.</p>
                      ) : (
                        <ul className={styles.article__items}>
                          {selected.sections[key].map((item, index) => (
                            <li key={`${key}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                </article>
              )}
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
