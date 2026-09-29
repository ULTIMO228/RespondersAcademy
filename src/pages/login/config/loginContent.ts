import type { UserRole } from "@/shared/api";

/* Тексты экрана входа тренажёра (spec/000-фронт/04-pages/00-auth.md «Состав»). */
export const BRAND_TITLE = "Учебный тренажёр оператора ДДС";

export const BRAND_LEAD =
  "Эмулятор АРМ-112 для подготовки операторов дежурно-диспетчерских служб г. Москвы: задания, экзамены и разбор ошибок.";

/** Нормативы АРМ и режимы тренажёра — вступительный блок экрана входа (Q&A в6). */
export const BRAND_FACTS = [
  { value: "30 с", text: "норматив реакции на новую карточку" },
  { value: "3 мин", text: "норматив полной отработки" },
  { value: "2 режима", text: "специалист 112 и оператор ДДС" },
] as const;
/** Граница учебной системы (ТЗ §4) — обязательна к показу без скролла. */
export const TRAINING_DISCLAIMER = "Учебная система. Не является рабочей системой-112";
/** Автовыход через 24 ч (spec/000-фронт/04-pages/00-auth.md «Поведение»). */
export const SESSION_EXPIRED_MESSAGE = "Сессия истекла. Войдите снова";

/** Аналог блока СТП реального интерфейса — текст-заглушка учебного комплекса. */
export const SUPPORT_CONTACTS = {
  title: "Техническая поддержка учебного комплекса",
  phone: "внутр. 300 (дежурный УМЦ)",
  email: "support@umc-112.local",
} as const;

/** Query-параметр демо-подсказки: /login?demo=teacher — предзаполнить форму учёткой роли. */
export const DEMO_ROLE_QUERY = "demo";

export type RoleShortcut = {
  role: UserRole;
  label: string;
};

/** Демо-ссылки «Войти как …»: предзаполняют форму учёткой роли (вход — всё равно через форму). */
export const ROLE_SHORTCUTS: RoleShortcut[] = [
  { role: "student", label: "обучающийся" },
  { role: "teacher", label: "преподаватель" },
  { role: "admin", label: "администратор" },
];

/** Логин учётки с isActive=false для демонстрации отказа входа (mocks/users.json → u-010). */
export const BLOCKED_DEMO_LOGIN = "egorov";
