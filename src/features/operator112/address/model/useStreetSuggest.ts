"use client";

import { useEffect, useRef, useState } from "react";

import { searchStreets, STREET_QUERY_MIN_LENGTH } from "@/shared/api";
import type { Street } from "@/shared/api";

export const SUGGEST_DEBOUNCE_MS = 250;

export type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; streets: Street[] }
  | { status: "error"; message: string };

export type StreetSearch = (query: string, signal?: AbortSignal) => Promise<Street[]>;

const defaultSearch: StreetSearch = (query, signal) => searchStreets(query, undefined, signal);

/**
 * Подсказки улиц: от STREET_QUERY_MIN_LENGTH символов, с задержкой ввода; предыдущий запрос отменяется.
 * Ошибка сервера (например, 400 порога) не роняет поле: показывается сообщением, ручной ввод продолжает работать.
 */
export function useStreetSuggest(
  query: string,
  enabled: boolean,
  search: StreetSearch = defaultSearch,
): SuggestState {
  const [state, setState] = useState<SuggestState>({ status: "idle" });
  const trimmed = query.trim();
  // Ссылка на search нестабильна: минификатор production-сборки встраивает значение по умолчанию в параметр и создаёт
  // функцию на каждом рендере. В deps эффекта её держать нельзя — он перезапускался бы каждый рендер и отменял запрос.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!enabled || trimmed.length < STREET_QUERY_MIN_LENGTH) {
      setState({ status: "idle" });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      searchRef.current(trimmed, controller.signal).then(
        (streets) => {
          if (!controller.signal.aborted) setState({ status: "ready", streets });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            message: error instanceof Error && error.message ? error.message : "Справочник улиц недоступен",
          });
        },
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, enabled]);

  return state;
}
