"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { sendAttemptEvent } from "@/shared/api";
import type {
  CardDraftCasualties,
  CardDraftWhat,
  ClassifierEntry,
  OperatorEvent,
  OperatorEventRequest,
} from "@/shared/api";

import { resolveEntry, restoreSelection, selectSign } from "./tree";
import type { Selection, SignLevel } from "./tree";

export type TypeTabsApi = {
  sendEvent: (attemptId: string, event: OperatorEventRequest) => Promise<OperatorEvent>;
};

const defaultApi: TypeTabsApi = { sendEvent: sendAttemptEvent };

/** Вкладка «Происшествие …»: своя группа ЕКП и свой выбор признаков. */
export type TypeTab = Selection & { id: string };

/** Выбор первой вкладки: по нему сервер считает список оповещения (событие signSelected). */
export type FirstTabValue = { group: string; signs: string[]; finalType: string; classifierCode: string };

type Options = {
  attemptId: string;
  entries: readonly ClassifierEntry[];
  /** Признаки последнего signSelected из попытки: восстановление первой вкладки после перезагрузки. */
  initialSigns?: readonly string[];
  disabled?: boolean;
  /** Флаги «Пострадавшие» и др. попадают в каждый элемент incidents (они относятся к карточке, не к вкладке). */
  casualties?: CardDraftCasualties;
  api?: TypeTabsApi;
  /**
   * Вызывается после успешной записи signSelected первой вкладки (и при её смене удалением):
   * экран пересчитывает по ней список оповещения.
   */
  onFirstTabChange?: (value: FirstTabValue) => void;
};

const NO_CASUALTIES: CardDraftCasualties = { injured: false, ambulanceRefused: false, blocked: false };

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Вкладка в формате черновика (CardDraftWhat); первая вкладка читается оценщиком как `what`. */
export function tabToIncident(
  entries: readonly ClassifierEntry[],
  tab: Selection,
  casualties: CardDraftCasualties = NO_CASUALTIES,
): CardDraftWhat {
  const entry = resolveEntry(entries, tab);
  return {
    pollAnswers: "",
    signs: [...tab.signs],
    flags: [],
    finalType: entry?.finalType ?? tab.group,
    classifierCode: entry?.code ?? "",
    casualties,
  };
}

/**
 * Вкладки типов карточки ПОВ-112 (спека 009, FR-017): «добавить тип происшествия» — новая вкладка (typeAdded),
 * «×» — удаление (typeRemoved {index}), выбор признаков первой вкладки — signSelected, как раньше.
 */
export function useTypeTabs({
  attemptId,
  entries,
  initialSigns,
  disabled = false,
  casualties = NO_CASUALTIES,
  api = defaultApi,
  onFirstTabChange,
}: Options) {
  const counter = useRef(0);
  const nextId = () => `tab-${++counter.current}`;
  const [tabs, setTabs] = useState<TypeTab[]>(() => {
    const restored = restoreSelection(entries, initialSigns ?? []);
    return restored.group ? [{ ...restored, id: nextId() }] : [];
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const onFirstRef = useRef(onFirstTabChange);
  onFirstRef.current = onFirstTabChange;

  // Актуальные вкладки для асинхронных обработчиков (быстрые клики не работают по устаревшему снимку).
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const report = useCallback(
    async (type: OperatorEventRequest["type"], payload: Record<string, unknown>): Promise<boolean> => {
      try {
        await api.sendEvent(attemptId, { type, payload });
        return true;
      } catch (error) {
        setNotice(toMessage(error, "Не удалось сохранить выбор типа"));
        return false;
      }
    },
    [api, attemptId],
  );

  const syncFirst = useCallback(
    async (first: Selection | undefined) => {
      const selection = first ?? { group: "", signs: [] };
      if (!(await report("signSelected", { signs: selection.signs }))) return;
      const entry = resolveEntry(entries, selection);
      onFirstRef.current?.({
        group: selection.group,
        signs: selection.signs,
        finalType: entry?.finalType ?? "",
        classifierCode: entry?.code ?? "",
      });
    },
    [entries, report],
  );

  const addType = useCallback(
    (group: string) => {
      if (disabled || !group) return;
      const tab: TypeTab = { group, signs: [], id: nextId() };
      const next = [...tabsRef.current, tab];
      setTabs(next);
      setActiveIndex(next.length - 1);
      setNotice(null);
      const entry = resolveEntry(entries, tab);
      void report("typeAdded", { finalType: entry?.finalType ?? group, classifierCode: entry?.code ?? "" });
    },
    [disabled, entries, report],
  );

  const removeType = useCallback(
    (index: number) => {
      if (disabled || index < 0 || index >= tabsRef.current.length) return;
      const next = tabsRef.current.filter((_, position) => position !== index);
      setTabs(next);
      setActiveIndex((current) =>
        Math.max(0, Math.min(current > index ? current - 1 : current, next.length - 1)),
      );
      setNotice(null);
      void (async () => {
        if (!(await report("typeRemoved", { index }))) return;
        // Первая вкладка сменилась (или исчезла): сервер считает список по новой первой.
        if (index === 0) await syncFirst(next[0]);
      })();
    },
    [disabled, report, syncFirst],
  );

  /** Выбор/снятие признака на активной вкладке; повторный клик по выбранному снимает его и последующие. */
  const chooseSign = useCallback(
    (level: SignLevel, value: string) => {
      if (disabled) return;
      const index = Math.min(activeIndex, tabsRef.current.length - 1);
      const tab = tabsRef.current[index];
      if (!tab) return;
      const changed: TypeTab = { ...tab, ...selectSign(tab, level, value) };
      setTabs(tabsRef.current.map((item, position) => (position === index ? changed : item)));
      setNotice(null);
      if (index === 0) void syncFirst(changed);
    },
    [activeIndex, disabled, syncFirst],
  );

  useEffect(() => {
    // Восстановленная первая вкладка: список оповещения запрашивается один раз при монтировании.
    if (tabsRef.current.length === 0 || tabsRef.current[0].signs.length === 0) return;
    const first = tabsRef.current[0];
    const entry = resolveEntry(entries, first);
    onFirstRef.current?.({
      group: first.group,
      signs: first.signs,
      finalType: entry?.finalType ?? "",
      classifierCode: entry?.code ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при монтировании
  }, []);

  return {
    tabs,
    activeIndex: Math.min(activeIndex, Math.max(tabs.length - 1, 0)),
    notice,
    setActive: setActiveIndex,
    addType,
    removeType,
    chooseSign,
    /** Вкладки в формате черновика карточки (`CardDraft.incidents`); первая — `what`. */
    incidents: tabs.map((tab) => tabToIncident(entries, tab, casualties)),
  };
}

export type TypeTabsState = ReturnType<typeof useTypeTabs>;
