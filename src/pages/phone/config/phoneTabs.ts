import type { TabItem } from "@/shared/ui";

/** Вкладки панели управления вызовами — как в АРМ ЕДДС (page-28–30, 50): Контакты / Звонки / SMS / Набор. */
export const PHONE_TABS: TabItem[] = [
  { id: "contacts", title: "Контакты" },
  { id: "calls", title: "Звонки" },
  { id: "sms", title: "SMS" },
  { id: "dial", title: "Набор" },
];

export const DEFAULT_PHONE_TAB = "contacts";

/** Сколько последних вызовов журнала показывает вкладка «Звонки». */
export const RECENT_CALLS_LIMIT = 5;
