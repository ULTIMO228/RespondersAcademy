"use client";

import { useEffect, useRef, useState } from "react";

import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";

import type { CardCaptionMap } from "./types";
import { useMonitorDeps } from "./deps";
import type { MonitorApi } from "./deps";

const EMPTY: CardCaptionMap = {};
const UNKNOWN_TYPE = "—";

/** Одна подпись: учебная c-NNN показывается номером сопоставленной фикстуры ПОВ-112. */
async function loadCaption(api: MonitorApi, cardId: string, signal: AbortSignal): Promise<CardCaptionMap> {
  const resolvedId = TRAINING_CARD_FIXTURE_IDS[cardId] ?? cardId;
  try {
    const details = await api.getCard(resolvedId, signal);
    if (details.kind === "fixture") {
      return { [cardId]: { number: String(details.card.number), type: details.card.what.finalType } };
    }
    return { [cardId]: { number: details.card.id, type: details.card.group ?? UNKNOWN_TYPE } };
  } catch {
    /* Карточки нет в моках — показываем идентификатор, мониторинг не ломается. */
    return { [cardId]: { number: cardId, type: UNKNOWN_TYPE } };
  }
}

/** Подписи «№ + тип» карточек занятия (GET /cards/[id]); уже загруженные не перезапрашиваются. */
export function useCardCaptions(cardIds: readonly string[]): CardCaptionMap {
  const { api } = useMonitorDeps();
  const loaded = useRef<CardCaptionMap>(EMPTY);
  const [captions, setCaptions] = useState<CardCaptionMap>(EMPTY);
  const key = [...new Set(cardIds)].sort().join(",");

  useEffect(() => {
    const missing = (key ? key.split(",") : []).filter((cardId) => !loaded.current[cardId]);
    if (missing.length === 0) return undefined;
    const controller = new AbortController();
    let isCancelled = false;
    void Promise.all(missing.map((cardId) => loadCaption(api, cardId, controller.signal))).then((parts) => {
      if (isCancelled) return;
      loaded.current = Object.assign({}, loaded.current, ...parts);
      setCaptions(loaded.current);
    });
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [api, key]);

  return captions;
}
