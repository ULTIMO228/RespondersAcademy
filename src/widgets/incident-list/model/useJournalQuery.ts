"use client";

import { useState } from "react";

import { hasActiveFilters } from "@/entities/incident";
import type { CardListRequest, CardListView } from "@/entities/incident";
import type { CardSearchFilters } from "@/shared/api";

import { DEFAULT_PAGE_SIZE } from "../config/journalOptions";
import type { JournalFilter } from "../config/journalOptions";
import { EMPTY_SEARCH_VALUES, toSearchFilters } from "../lib/searchForm";
import type { AdvancedSearchField, AdvancedSearchValues } from "../lib/searchForm";

const FILTER_VIEWS: Record<JournalFilter, CardListView> = {
  "": "all",
  all: "all",
  empty: "empty",
  sms: "sms",
};

/** Форма расширенного поиска: вводимые значения и применённые («найти») фильтры. */
function useSearchForm() {
  const [values, setValues] = useState<AdvancedSearchValues>(EMPTY_SEARCH_VALUES);
  const [applied, setApplied] = useState<CardSearchFilters>({});
  return {
    values,
    applied,
    setValue: <TField extends AdvancedSearchField>(field: TField, value: AdvancedSearchValues[TField]) =>
      setValues((current) => ({ ...current, [field]: value })),
    apply: () => setApplied(toSearchFilters(values)),
    clear: () => {
      setValues(EMPTY_SEARCH_VALUES);
      setApplied({});
    },
  };
}

/**
 * Параметры ленты: вид «выберите что показать», страница и размер страницы, форма и применённые фильтры
 * расширенного поиска. Без фильтров — рабочие карточки ПОВ-112 (dataset=fixtures), с фильтрами — полный
 * датасет мок-слоя (all: + 96 учебных карточек). Смена фильтров/вида/размера — на первую страницу.
 */
export function useJournalQuery() {
  const [filter, setFilterState] = useState<JournalFilter>("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const search = useSearchForm();
  const isSearchApplied = hasActiveFilters(search.applied);
  const request: CardListRequest = {
    filters: search.applied,
    view: FILTER_VIEWS[filter],
    dataset: isSearchApplied ? "all" : "fixtures",
    page: pageIndex + 1,
    perPage: pageSize,
  };
  const firstPage =
    <TArgs extends unknown[]>(action: (...args: TArgs) => void) =>
    (...args: TArgs) => {
      action(...args);
      setPageIndex(0);
    };

  return {
    filter,
    values: search.values,
    request,
    isSearchApplied,
    setPageIndex,
    setValue: search.setValue,
    setFilter: firstPage((next: JournalFilter) => setFilterState(next)),
    setPageSize: firstPage((next: number) => setPageSizeState(next)),
    applySearch: firstPage(search.apply),
    resetSearch: firstPage(() => {
      search.clear();
      setFilterState("");
    }),
  };
}
