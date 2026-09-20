/*
 * Словарь событий журнала аудита (21-admin-system.md §4). Живёт в shared/config, потому что нужен
 * одновременно мок-слою (серверный фильтр «Тип события» в GET /admin/audit) и экрану администратора
 * (подписи колонки «Событие» и селекта типов); shared/api/mock не может импортировать entities.
 *
 * Тип события выводится из префикса кода действия (`user.block` → users): коды пишут все волны
 * (`appendAuditEntry`), а отдельного поля `type` в AuditLogEntry (05-data-models.md §9) нет.
 */
import type { AuditEventType } from "@/shared/api";

export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  "login",
  "users",
  "grades",
  "settings",
  "backup",
  "card",
  "content",
];

export const AUDIT_EVENT_TYPE_TITLES: Record<AuditEventType, string> = {
  login: "Вход в систему",
  users: "Управление пользователями",
  grades: "Оценки",
  settings: "Настройки системы",
  backup: "Резервное копирование",
  card: "События карточек",
  content: "Сценарии и материалы",
};

/** Префикс кода действия → тип события. Неизвестный префикс — «Настройки системы» не подставляем. */
const TYPE_BY_PREFIX: Record<string, AuditEventType> = {
  auth: "login",
  user: "users",
  evaluation: "grades",
  report: "grades",
  settings: "settings",
  service: "settings",
  backup: "backup",
  card: "card",
  scenario: "content",
  material: "content",
  profileMapping: "content",
};

/** Человекочитаемые названия событий (колонка «Событие», образец экрана «аудит» ПОВ-112). */
export const AUDIT_ACTION_TITLES: Record<string, string> = {
  "auth.login": "Вход в систему",
  "user.create": "Создана учётная запись",
  "user.update": "Изменена учётная запись",
  "user.roleChange": "Смена роли",
  "user.block": "Блокировка учётной записи",
  "user.unblock": "Разблокировка учётной записи",
  "user.passwordReset": "Сброс пароля",
  "evaluation.override": "Оценка изменена преподавателем",
  "report.feedback": "Обратная связь по отчёту",
  "settings.update": "Смена настроек",
  "service.action": "Управление сервисом",
  "backup.run": "Резервное копирование",
  "card.registered": "Зарегистрирована",
  "card.processed": "Отработана",
  "card.checked": "Проверена",
  "card.notNotified": "Переход в Не оповещено",
  "card.notCompleted": "Переход в Не завершено",
  "card.refused": "Переход в Отказ",
  "card.violationsFixed": "Нарушения исправлены",
  "scenario.create": "Создан сценарий",
  "scenario.update": "Изменён сценарий",
  "scenario.delete": "Удалён сценарий",
  "scenario.generate": "Сгенерированы сценарии (ИИ)",
  "scenario.validate": "Проверка сценария",
  "material.upload": "Загружен учебный материал",
  "profileMapping.save": "Привязка профильных категорий",
};

/** Тип события по коду действия; неизвестный код — undefined (в фильтр по типу не попадает). */
export function resolveAuditType(action: string): AuditEventType | undefined {
  return TYPE_BY_PREFIX[action.split(".")[0]];
}

/** Название события для колонки «Событие»; для неизвестного кода — сам код (честно, без выдумки). */
export function describeAuditAction(action: string): string {
  return AUDIT_ACTION_TITLES[action] ?? action;
}
