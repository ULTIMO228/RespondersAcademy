export type SystemTabId = "services" | "monitoring" | "settings" | "logs";

export const SYSTEM_TABS: { id: SystemTabId; title: string }[] = [
  { id: "services", title: "Состояние сервисов" },
  { id: "monitoring", title: "Мониторинг нагрузки" },
  { id: "settings", title: "Настройки" },
  { id: "logs", title: "Журналы и аудит" },
];

export const DEFAULT_TAB: SystemTabId = "services";
