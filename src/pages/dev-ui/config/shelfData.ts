import type { ArmIconName, StatusTone } from "@/shared/ui";

export const DEMO_STATUSES: { title: string; tone: StatusTone }[] = [
  { title: "Новая", tone: "new" },
  { title: "Создана", tone: "created" },
  { title: "Назначена", tone: "assigned" },
  { title: "Принята", tone: "accepted" },
  { title: "Завершена", tone: "completed" },
  { title: "Закрыта", tone: "closed" },
  { title: "Только телефонная", tone: "phoneOnly" },
];

export const DEMO_ICONS: ArmIconName[] = [
  "search",
  "advanced-chevron",
  "section-collapse",
  "notification",
  "filter-chevron",
  "top-monitor",
  "top-settings",
  "top-info",
  "top-exit",
  "sort-down",
  "row-expand",
  "row-bookmark",
  "row-important",
  "row-reminder",
  "service-status",
  "clipboard",
  "page-dropdown",
  "page-size-dropdown",
  "pagination-prev",
  "pagination-next",
];

export const DEMO_ROWS = [
  { id: "1", name: "Иванов Сергей Петрович", arm: 1, score: 96 },
  { id: "2", name: "Петрова Анна Дмитриевна", arm: 2, score: 71 },
];
