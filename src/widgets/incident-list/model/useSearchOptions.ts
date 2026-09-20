"use client";

import { useEffect, useMemo, useState } from "react";

import type { ArmCardFixtureContract, ReferenceData } from "@/shared/api";

import { buildSearchOptions } from "../lib/searchOptions";
import { useJournalDeps } from "./deps";
import type { AdvancedSearchOptions } from "./types";

const FIXTURES_PAGE_SIZE = 100;

/**
 * Значения расширенного поиска: справочники + АРМ и дерево признаков по рабочим карточкам
 * (GET /api/mock/cards?dataset=fixtures). Карточки запрашиваются один раз — при первом открытии формы.
 */
export function useSearchOptions(
  reference: ReferenceData | null,
  isEnabled: boolean,
): AdvancedSearchOptions | null {
  const { api } = useJournalDeps();
  const [fixtures, setFixtures] = useState<ArmCardFixtureContract[] | null>(null);
  const shouldLoad = isEnabled && fixtures === null;

  useEffect(() => {
    if (!shouldLoad) return undefined;
    const controller = new AbortController();
    api
      .getCards({ dataset: "fixtures", perPage: FIXTURES_PAGE_SIZE }, controller.signal)
      .then((page) => setFixtures(page.items))
      .catch(() => {
        if (!controller.signal.aborted) setFixtures([]);
      });
    return () => controller.abort();
  }, [api, shouldLoad]);

  return useMemo(
    () => (reference && fixtures ? buildSearchOptions(reference, fixtures) : null),
    [reference, fixtures],
  );
}
