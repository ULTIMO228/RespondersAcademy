"use client";

import Link from "next/link";

import { getMyFocus } from "@/shared/api";
import type { MyFocusResponse } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Card, ResourceView, useResource } from "@/shared/ui/platform";

import styles from "./MyFocus.module.css";

export type MyFocusApi = {
  focus: (signal?: AbortSignal) => Promise<MyFocusResponse>;
};

const defaultApi: MyFocusApi = { focus: (signal) => getMyFocus(signal) };

/**
 * «Над чем поработать» (FR-020): до трёх тем обучающегося с короткой подсказкой и ссылкой на материал.
 * Только его собственные данные, без сравнений и оценочных слов. Без бэкенда блок не показывается совсем.
 */
export function MyFocus({ api = defaultApi }: { api?: MyFocusApi }) {
  const focus = useResource((signal) => api.focus(signal), [api]);
  if (focus.state.status === "serverRequired") return null;
  return (
    <Card title="Над чем поработать">
      <ResourceView
        state={focus.state}
        onRetry={focus.reload}
        errorTitle="Не удалось загрузить подсказки"
        skeletonLines={2}
      >
        {(data) =>
          data.items.length === 0 ? (
            <p className={styles.message}>{data.message ?? "Пока замечаний нет"}</p>
          ) : (
            <ul className={styles.list}>
              {data.items.map((item) => (
                <li key={item.stageId} className={styles.item}>
                  <h3 className={styles.title}>{item.title}</h3>
                  <p className={styles.hint}>{item.hint}</p>
                  <Link
                    className={styles.link}
                    href={item.articleId ? ROUTES.referenceArticle(item.articleId) : ROUTES.reference}
                    aria-label={`Открыть материал: ${item.title}`}
                  >
                    Открыть материал
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </ResourceView>
    </Card>
  );
}
