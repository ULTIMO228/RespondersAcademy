"use client";

import { useState } from "react";

import { useSessionUser } from "@/entities/user";
import { Field, PageHeader, ResourceView, TabNav, useResource } from "@/shared/ui/platform";
import type { TabNavItem } from "@/shared/ui/platform";
import { Card, ServerRequiredState } from "@/shared/ui/platform";

import { referenceApi } from "../api/referenceApi";
import type { ReferenceApi } from "../api/referenceApi";
import { HOTKEY_SECTIONS } from "../config/hotkeys";
import { HELP_MATERIALS } from "../config/materials";
import { filterArticles, filterHotkeys, filterMaterials, filterNumbers } from "../lib/search";
import { ArticlesTab } from "./ArticlesTab";
import { HotkeysTab } from "./HotkeysTab";
import { MaterialsTab } from "./MaterialsTab";
import { NumbersTab } from "./NumbersTab";
import { StatusesTab } from "./StatusesTab";
import styles from "./Reference.module.css";

type TabId = "articles" | "numbers" | "materials" | "hotkeys" | "statuses";

type ReferenceScreenProps = {
  api?: ReferenceApi;
  /** Запрос из адреса `/reference?q=` (поиск в верхней полосе, ссылка «Изучить» по группе). */
  initialQuery?: string;
  /** Статья из `/reference?article=` (рекомендация). */
  initialArticleId?: string;
};

/**
 * Справочник (T045), доступен всем ролям: статьи базы знаний (105, пять разделов), служебные номера, памятки, горячие клавиши
 * и статусы; общий поиск действует на все вкладки, у вкладок — число найденного. Статьи есть только с бэкендом, остальные вкладки
 * работают автономно.
 */
export function ReferenceScreen({
  api = referenceApi,
  initialQuery = "",
  initialArticleId,
}: ReferenceScreenProps) {
  const user = useSessionUser();
  const canEdit = user?.role === "teacher" || user?.role === "admin";
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<TabId>(initialArticleId ? "articles" : "articles");
  const articles = useResource((signal) => api.articles(signal), [api]);
  const reference = useResource((signal) => api.reference(signal), [api]);
  const materials = useResource((signal) => api.materials(signal), [api]);

  const count = (id: TabId): string => {
    switch (id) {
      case "articles":
        return articles.state.status === "ready"
          ? ` (${filterArticles(articles.state.data, query, "").length})`
          : "";
      case "numbers":
        return reference.state.status === "ready"
          ? ` (${filterNumbers(reference.state.data.internalNumbers, query).length})`
          : "";
      case "materials":
        return ` (${filterMaterials(HELP_MATERIALS, query).length + (materials.state.status === "ready" ? materials.state.data.length : 0)})`;
      case "hotkeys":
        return ` (${filterHotkeys(HOTKEY_SECTIONS, query).reduce((sum, section) => sum + section.rows.length, 0)})`;
      case "statuses":
        return "";
    }
  };
  const items: TabNavItem[] = [
    { id: "articles", title: `Статьи${count("articles")}` },
    { id: "numbers", title: `Служебные номера${count("numbers")}` },
    { id: "materials", title: `Памятки${count("materials")}` },
    { id: "hotkeys", title: `Горячие клавиши${count("hotkeys")}` },
    { id: "statuses", title: "Статусы" },
  ];

  return (
    <>
      <PageHeader
        title="Справочник"
        description="Статьи базы знаний, служебные номера, памятки, горячие клавиши АРМ и статусы"
      />
      <div className={styles.search}>
        <Field
          label="Поиск по всем разделам"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <TabNav
        label="Разделы справочника"
        items={items}
        activeId={tab}
        onChange={(id) => setTab(id as TabId)}
      />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "articles" ? (
          <ResourceView
            state={articles.state}
            onRetry={articles.reload}
            errorTitle="Не удалось загрузить статьи"
            skeletonLines={5}
          >
            {(data) => (
              <ArticlesTab
                articles={data}
                query={query}
                initialArticleId={initialArticleId}
                canEdit={canEdit}
                onSave={api.updateArticle}
              />
            )}
          </ResourceView>
        ) : null}
        {tab === "numbers" ? (
          <ResourceView
            state={reference.state}
            onRetry={reference.reload}
            errorTitle="Не удалось загрузить номера"
          >
            {(data) => <NumbersTab numbers={data.internalNumbers} query={query} />}
          </ResourceView>
        ) : null}
        {tab === "materials" ? (
          materials.state.status === "serverRequired" ? (
            <Card>
              <ServerRequiredState onRetry={materials.reload} />
            </Card>
          ) : (
            <MaterialsTab
              query={query}
              uploaded={materials.state.status === "ready" ? materials.state.data : []}
              onOpenHotkeys={() => setTab("hotkeys")}
            />
          )
        ) : null}
        {tab === "hotkeys" ? <HotkeysTab query={query} /> : null}
        {tab === "statuses" ? (
          <ResourceView
            state={reference.state}
            onRetry={reference.reload}
            errorTitle="Не удалось загрузить статусы"
          >
            {(data) => <StatusesTab reference={data} />}
          </ResourceView>
        ) : null}
      </div>
    </>
  );
}
