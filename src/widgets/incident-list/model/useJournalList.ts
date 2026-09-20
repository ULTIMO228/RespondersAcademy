"use client";

import { useMemo } from "react";

import { mapArmFixture, toIncidentLinks } from "@/entities/incident";
import type { CardListRequest, IncidentListItem, IncidentMapContext } from "@/entities/incident";

import { getPageCount, toRangeLabel } from "../lib/pagination";
import { useCardsList } from "./useCardsList";
import type { LoadStatus } from "./types";

export type JournalPage = {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** «1-10 из 16» / «0 из 0» */
  rangeLabel: string;
};

/** Лента журнала: срез мок-слоя → строки (списочная проекция + цепочки связей) + подписи пагинации. */
export function useJournalList(
  request: CardListRequest,
  context: IncidentMapContext | null,
  isAutoUpdate: boolean,
) {
  const list = useCardsList(request, isAutoUpdate);

  const items: IncidentListItem[] = useMemo(() => {
    if (!context) return [];
    return list.cards.map((card) => ({
      ...mapArmFixture(card, context),
      links: toIncidentLinks(list.links[card.id] ?? [], card.id),
    }));
  }, [list.cards, list.links, context]);

  const pageIndex = request.page - 1;
  const page: JournalPage = {
    pageIndex,
    pageCount: getPageCount(list.total, request.perPage),
    pageSize: request.perPage,
    total: list.total,
    rangeLabel: toRangeLabel(pageIndex, request.perPage, list.total),
  };
  const status: LoadStatus = context ? list.status : "loading";
  return { items, page, status, message: list.message, reload: list.reload };
}
