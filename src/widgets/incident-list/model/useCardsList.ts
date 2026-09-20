"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { toCardsQuery } from "@/entities/incident";
import type { CardListRequest } from "@/entities/incident";
import type { ArmCardFixtureContract, CardLink, CardsQuery } from "@/shared/api";

import type { JournalApi } from "./deps";
import { useJournalDeps } from "./deps";
import { isAbortError, toErrorMessage, toFailureStatus } from "./loadStatus";
import type { LoadStatus } from "./types";

/** Период автообновления списка (тумблер «Автообновление»). */
export const LIST_POLL_MS = 10_000;
/** Учебные карточки (c-NNN) — у фикстур ПОВ-112 связей в моках нет (расхождение №3 12-tasks.md). */
const TRAINING_ID_PREFIX = "c-";

export type CardsListState = {
  key: string;
  status: LoadStatus;
  cards: ArmCardFixtureContract[];
  total: number;
  links: Record<string, CardLink[]>;
  message: string;
};

const INITIAL_STATE: CardsListState = {
  key: "",
  status: "loading",
  cards: [],
  total: 0,
  links: {},
  message: "",
};

async function loadLinks(
  api: JournalApi,
  cards: ArmCardFixtureContract[],
): Promise<Record<string, CardLink[]>> {
  const trainingIds = cards.map((card) => card.id).filter((id) => id.startsWith(TRAINING_ID_PREFIX));
  const responses = await Promise.all(
    trainingIds.map((id) => api.postCardLinks(id).catch(() => ({ cardId: id, chain: [] }))),
  );
  return Object.fromEntries(responses.map((response) => [response.cardId, response.chain]));
}

async function loadPage(api: JournalApi, query: CardsQuery, signal: AbortSignal) {
  const page = await api.getCards(query, signal);
  return { page, links: await loadLinks(api, page.items) };
}

/** Периодический вызов (автообновление); выключение и unmount останавливают интервал. */
function usePolling(isEnabled: boolean, intervalMs: number, onTick: () => void): void {
  const tick = useEffectEvent(onTick);
  useEffect(() => {
    if (!isEnabled) return undefined;
    const handle = setInterval(() => tick(), intervalMs);
    return () => clearInterval(handle);
  }, [isEnabled, intervalMs]);
}

/**
 * Страница ленты GET /api/mock/cards по фильтрам/виду/пагинации + read-only связи учебных карточек.
 * Смена запроса — состояние загрузки; автообновление перезапрашивает тот же срез без мигания.
 */
export function useCardsList(request: CardListRequest, isAutoUpdate: boolean) {
  const { api } = useJournalDeps();
  const queryKey = JSON.stringify(toCardsQuery(request));
  const [state, setState] = useState<CardsListState>(INITIAL_STATE);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) =>
      current.key === queryKey ? current : { ...current, key: queryKey, status: "loading" },
    );
    loadPage(api, JSON.parse(queryKey) as CardsQuery, controller.signal)
      .then(({ page, links }) =>
        setState({
          key: queryKey,
          status: "ready",
          cards: page.items,
          total: page.total,
          links,
          message: "",
        }),
      )
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: toFailureStatus(error),
          message: toErrorMessage(error),
        }));
      });
    return () => controller.abort();
  }, [api, queryKey, reloadToken]);

  const reload = () => setReloadToken((token) => token + 1);
  usePolling(isAutoUpdate, LIST_POLL_MS, reload);
  return { ...state, reload };
}
