"use client";

import { useEffect, useRef, useState } from "react";

import { ROUTES } from "@/shared/config";

import { referencePanelApi } from "../model/referenceApi";
import type { ReferencePanelApi } from "../model/referenceApi";
import { useReferenceAccess } from "../model/useReferenceAccess";
import { BubbleIcon, CloseIcon, ExternalIcon } from "./icons";
import { ReferenceBrowser } from "./ReferenceBrowser";

import styles from "./ReferencePanel.module.css";

const PANEL_ID = "arm-reference-panel";
const WINDOW_NAME = "arm-reference";
const WINDOW_FEATURES = "popup,width=720,height=900";

type ReferenceToggleProps = { api?: ReferencePanelApi };

/**
 * Кнопка-«сообщение» «Справочник» в правом краю панели тренажёра и окошко справочника поверх АРМ (спека 005, US1).
 * Окошко не размонтирует страницу АРМ — карточка, введённые данные и таймеры продолжают работать. При запрете
 * в задании кнопки нет.
 */
export function ReferenceToggle({ api = referencePanelApi }: ReferenceToggleProps) {
  const { state, recheck } = useReferenceAccess(api);
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = () => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    recheck();
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    // FR-002: фокус возвращается туда, где был до открытия (поле карточки или кнопка).
    window.requestAnimationFrame(() => returnFocus.current?.focus());
  };

  if (state === "locked") return null;
  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => (open ? close() : show())}
      >
        <BubbleIcon />
        <span>Справочник</span>
      </button>
      {open ? <ReferencePanel api={api} onClose={close} /> : null}
    </>
  );
}

type ReferencePanelProps = { api: ReferencePanelApi; onClose: () => void };

function ReferencePanel({ api, onClose }: ReferencePanelProps) {
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openWindow = () =>
    window.open(ROUTES.referenceWindow(query, articleId), WINDOW_NAME, WINDOW_FEATURES);

  return (
    <aside id={PANEL_ID} className={styles.panel} role="dialog" aria-modal="false" aria-label="Справочник">
      <header className={styles.panel__head}>
        <span className={styles.panel__badge} aria-hidden="true">
          <BubbleIcon size={18} />
        </span>
        <div className={styles.panel__heading}>
          <h2 className={styles.panel__title}>Справочник</h2>
          <p className={styles.panel__subtitle}>Найдите нужное по ключевым словам</p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={openWindow}
          aria-label="Открыть в новом окне"
          title="Открыть в новом окне"
        >
          <ExternalIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Закрыть справочник (Esc)"
          title="Закрыть (Esc)"
        >
          <CloseIcon />
        </button>
      </header>
      <div className={styles.panel__body}>
        <ReferenceBrowser
          api={api}
          query={query}
          onQuery={setQuery}
          articleId={articleId}
          onArticle={setArticleId}
          autoFocus
        />
      </div>
    </aside>
  );
}
