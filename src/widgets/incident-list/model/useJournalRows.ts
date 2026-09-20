"use client";

import { useState } from "react";

import type { IncidentListItem, IncidentRowActions } from "@/entities/incident";

import { useIdSet } from "./useIdSet";

/**
 * Состояние строк: «Описание» раскрыто по умолчанию (ДДС_image3) — хранится множество свёрнутых;
 * цепочки связей раскрываются кликом; открытый предпросмотр (id).
 */
export function useJournalRows(items: IncidentListItem[]) {
  const collapsed = useIdSet([]);
  const linksOpen = useIdSet([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const actions: Pick<IncidentRowActions, "onToggleExpand" | "onToggleLinks" | "onPreview"> = {
    onToggleExpand: collapsed.toggle,
    onToggleLinks: linksOpen.toggle,
    onPreview: setPreviewId,
  };

  return {
    isExpanded: (item: IncidentListItem) => item.description !== null && !collapsed.ids.has(item.id),
    isLinksOpen: (item: IncidentListItem) => linksOpen.ids.has(item.id),
    actions,
    previewItem: items.find((item) => item.id === previewId) ?? null,
    closePreview: () => setPreviewId(null),
  };
}
