"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, DragEvent } from "react";

import {
  draftFromTemplate,
  FLOW_BLOCKS,
  FLOW_DRAG_MIME,
  FLOW_GROUPS,
  FLOW_LIBRARY_TYPES,
  FLOW_TEMPLATES,
} from "@/entities/scenario-flow";
import type { FlowBlockDraft, FlowGroupId, FlowMode } from "@/entities/scenario-flow";
import { PfIcon } from "@/shared/ui/platform";
import type { PfIconName } from "@/shared/ui/platform";

import styles from "./FlowLibrary.module.css";

type FlowLibraryProps = {
  mode: FlowMode;
  /** Добавить блок после выбранного шага (щелчок или Enter). */
  onAdd: (draft: FlowBlockDraft) => void;
  disabled?: boolean;
};

type LibraryEntry = {
  key: string;
  draft: FlowBlockDraft;
  title: string;
  description: string;
  icon: PfIconName;
  group: FlowGroupId;
  haystack: string;
};

const groupStyle = (group: FlowGroupId) => ({ "--cat": `var(--pf-flow-cat-${group})` }) as CSSProperties;

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").trim();
}

/**
 * Левая библиотека блоков (design-concept.md §5): вкладки «Блоки» и «Готовые действия», поиск по названию,
 * описанию и синонимам, группы со сворачиванием. Блок добавляется щелчком, клавишей Enter или перетаскиванием на поле.
 */
export function FlowLibrary({ mode, onAdd, disabled = false }: FlowLibraryProps) {
  const [tab, setTab] = useState<"blocks" | "templates">("blocks");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<FlowGroupId>>(new Set(["edge"]));

  const blocks = useMemo<LibraryEntry[]>(
    () =>
      FLOW_LIBRARY_TYPES.map((type) => {
        const block = FLOW_BLOCKS[type];
        return {
          key: type,
          draft: { type },
          title: block.title,
          description: block.description,
          icon: block.icon,
          group: block.group,
          haystack: normalize([block.title, block.description, ...block.keywords].join(" ")),
        };
      }),
    [],
  );
  const templates = useMemo<LibraryEntry[]>(
    () =>
      FLOW_TEMPLATES.filter((template) => template.modes.includes(mode)).map((template) => {
        const block = FLOW_BLOCKS[template.type];
        return {
          key: template.id,
          draft: draftFromTemplate(template),
          title: template.title,
          description: block.title,
          icon: block.icon,
          group: block.group,
          haystack: normalize([template.title, block.title, ...template.keywords].join(" ")),
        };
      }),
    [mode],
  );

  const needle = normalize(query);
  const searching = needle.length > 0;
  // При поиске показываем совпадения из обеих вкладок: «газ» находит и блок, и готовое действие.
  const source = searching ? [...blocks, ...templates] : tab === "blocks" ? blocks : templates;
  const visible = source.filter((entry) => !searching || entry.haystack.includes(needle));

  const toggle = (group: FlowGroupId) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const startDrag = (event: DragEvent<HTMLButtonElement>, entry: LibraryEntry) => {
    event.dataTransfer.setData(FLOW_DRAG_MIME, JSON.stringify(entry.draft));
    event.dataTransfer.effectAllowed = "copy";
  };

  const renderEntry = (entry: LibraryEntry) => (
    <li key={entry.key}>
      <button
        type="button"
        className={styles.item}
        style={groupStyle(entry.group)}
        draggable={!disabled}
        disabled={disabled}
        onClick={() => onAdd(entry.draft)}
        onDragStart={(event) => startDrag(event, entry)}
        title={`${entry.title}. ${entry.description}. Щелчок или Enter — добавить после выбранного шага, можно перетащить на схему.`}
      >
        <span className={styles.tile} aria-hidden="true">
          <PfIcon name={entry.icon} />
        </span>
        <span className={styles.item__text}>
          <span className={styles.item__name}>{entry.title}</span>
          <span className={styles.item__desc}>{entry.description}</span>
        </span>
      </button>
    </li>
  );

  return (
    <aside className={styles.library} aria-label="Библиотека блоков">
      <div className={styles.head}>
        <div className={styles.tabs} role="group" aria-label="Что показать">
          <button
            type="button"
            aria-pressed={tab === "blocks"}
            className={styles.tab}
            onClick={() => setTab("blocks")}
          >
            Блоки
          </button>
          <button
            type="button"
            aria-pressed={tab === "templates"}
            className={styles.tab}
            onClick={() => setTab("templates")}
          >
            Готовые действия <span className={styles.count}>{templates.length}</span>
          </button>
        </div>
        <label className={styles.search}>
          <PfIcon name="search" size={18} />
          <span className="visually-hidden">Найти блок или действие</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти блок или действие"
            className={styles.search__input}
          />
        </label>
      </div>
      <div className={styles.body}>
        {searching ? (
          visible.length ? (
            <ul className={styles.list} aria-label="Найдено">
              {visible.map(renderEntry)}
            </ul>
          ) : (
            <p className={styles.empty} role="status">
              Ничего не найдено. Попробуйте другое слово.
            </p>
          )
        ) : tab === "templates" ? (
          <ul className={styles.list} aria-label="Готовые действия">
            {visible.map(renderEntry)}
          </ul>
        ) : (
          FLOW_GROUPS.map((group) => {
            const entries = visible.filter((entry) => entry.group === group.id);
            if (!entries.length) return null;
            const open = !collapsed.has(group.id);
            return (
              <section key={group.id} className={styles.group}>
                <h3 className={styles.group__title}>
                  <button
                    type="button"
                    className={styles.group__toggle}
                    aria-expanded={open}
                    onClick={() => toggle(group.id)}
                  >
                    <span className={styles.swatch} style={groupStyle(group.id)} aria-hidden="true" />
                    {group.title}
                    <PfIcon
                      name={open ? "chevronDown" : "chevronRight"}
                      size={18}
                      className={styles.chevron}
                    />
                  </button>
                </h3>
                {open ? <ul className={styles.list}>{entries.map(renderEntry)}</ul> : null}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
