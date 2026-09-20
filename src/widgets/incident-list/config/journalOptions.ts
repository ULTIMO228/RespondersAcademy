import type { SelectOption } from "@/shared/ui";

/** Фильтр ленты «выберите что показать» (источник п. 1.3, 3.4, 3.15). */
export type JournalFilter = "" | "all" | "empty" | "sms";

export const SHOW_OPTIONS: SelectOption[] = [
  { value: "all", label: "Все карточки" },
  { value: "empty", label: "Пустые карточки" },
  { value: "sms", label: "Новые СМС" },
];

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

/** id формы «расширенный по параметрам» для aria-controls. */
export const ADVANCED_SEARCH_ID = "journal-advanced-search";
