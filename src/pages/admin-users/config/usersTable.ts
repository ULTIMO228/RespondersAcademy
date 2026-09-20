import type { SelectOption } from "@/shared/ui";

/** Колонки реестра (spec/04-pages/20; колонка «создана» не выводится — поле удалено из модели). */
export const USER_TABLE_COLUMNS = [
  { key: "fullName", title: "ФИО" },
  { key: "login", title: "Логин" },
  { key: "role", title: "Роль" },
  { key: "arm", title: "№ АРМ" },
  { key: "group", title: "Группа" },
  { key: "service", title: "Служба" },
  { key: "state", title: "Состояние" },
  { key: "actions", title: "Действия" },
] as const;

export const ALL_VALUE = "";

export const STATE_OPTIONS: SelectOption[] = [
  { value: "active", label: "активна" },
  { value: "blocked", label: "заблокирована" },
];

export const AUDIT_NOTE = "запись в аудит";
