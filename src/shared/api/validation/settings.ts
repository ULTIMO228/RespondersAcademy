/*
 * Валидация системных настроек (21-admin-system.md §3). Одни и те же правила работают на сервере
 * (PATCH /admin/system/settings → 422) и в формах админки — числа-нормативы объявлены здесь, а не
 * в компонентах: НОРМАТИВЫ ТЗ §7 (≥ 20 одновременных сессий, отклик ≤ 2 с) и §9 (бэкап не реже
 * 1 раза в сутки, журналы ≥ 6 месяцев).
 */
import type { SystemSettings, SystemSettingsPatch } from "../types";

/** Нормативы ТЗ: нарушение этих границ — отказ сохранения (422). */
export const SETTINGS_NORMS = {
  /** ТЗ §9: резервное копирование не реже 1 раза в сутки. */
  backupMaxPeriodHours: 24,
  /** ТЗ §9: журналы хранятся не менее 6 месяцев. */
  loggingMinRetentionMonths: 6,
  /** ТЗ §7: не менее 20 одновременных сессий. */
  sessionLimitMin: 20,
  /** ТЗ §7: отклик интерфейса не более 2 секунд (норматив графиков мониторинга). */
  responseMaxSec: 2,
} as const;

/** Прикладные диапазоны полей (за пределами нормативов ТЗ — защита от бессмысленных значений). */
export const SETTINGS_LIMITS = {
  backupMinPeriodHours: 1,
  loggingMaxRetentionMonths: 60,
  sessionLimitMax: 100,
  refreshMinSec: 1,
  refreshMaxSec: 60,
  bufferMinRecords: 50,
  bufferMaxRecords: 5000,
  passwordMinLength: 6,
  passwordMaxLength: 64,
  lockAttemptsMin: 1,
  lockAttemptsMax: 10,
  recoveryAttemptsMin: 1,
  recoveryAttemptsMax: 5,
} as const;

export const LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;

/** Путь поля настроек: `backup.periodHours` — ключ для подсветки поля формы. */
export type SettingsFieldError = { field: string; message: string };

const N = SETTINGS_NORMS;
const L = SETTINGS_LIMITS;

function isBlank(value: unknown): value is undefined | null {
  return value === undefined || value === null;
}

function checkInt(
  errors: SettingsFieldError[],
  field: string,
  value: unknown,
  min: number,
  max: number,
  message: string,
): void {
  if (isBlank(value)) return;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push({ field, message });
  }
}

function checkHost(errors: SettingsFieldError[], field: string, value: unknown, message: string): void {
  if (isBlank(value)) return;
  if (typeof value !== "string" || !/^[a-z0-9.-]+(:\d{2,5})?$/i.test(value.trim())) {
    errors.push({ field, message });
  }
}

/* Сообщения называют норматив ТЗ дословно — их же видит администратор у поля формы. */
export const SETTINGS_MESSAGES = {
  backupPeriod: `Резервное копирование — не реже 1 раза в сутки: период от ${L.backupMinPeriodHours} до ${N.backupMaxPeriodHours} ч (ТЗ §9)`,
  loggingRetention: `Срок хранения журналов — не менее ${N.loggingMinRetentionMonths} месяцев (ТЗ §9)`,
  loggingLevel: "Уровень логов: INFO, WARN или ERROR",
  sessionLimit: `Не менее ${N.sessionLimitMin} одновременных сессий (ТЗ §7); допустимо до ${L.sessionLimitMax}`,
  refreshInterval: `Интервал опроса ленты — от ${L.refreshMinSec} до ${L.refreshMaxSec} сек`,
  inputBuffer: `Буфер ввода — от ${L.bufferMinRecords} до ${L.bufferMaxRecords} записей`,
  passwordLength: `Минимальная длина пароля — от ${L.passwordMinLength} до ${L.passwordMaxLength} символов`,
  lockAttempts: `Блокировка после ${L.lockAttemptsMin}–${L.lockAttemptsMax} неудачных попыток`,
  recoveryAttempts: `Число попыток автовосстановления — от ${L.recoveryAttemptsMin} до ${L.recoveryAttemptsMax}`,
  sipServer: "SIP-сервер: имя хоста, при необходимости с портом (например, sip.arm112.local:5060)",
  realm: "Realm: доменное имя учебного контура (например, arm112.local)",
} as const;

/** Ошибки полей патча настроек; пустой массив — патч допустим. */
export function validateSettingsPatch(patch: SystemSettingsPatch): SettingsFieldError[] {
  const errors: SettingsFieldError[] = [];
  checkHost(errors, "telephony.sipServer", patch.telephony?.sipServer, SETTINGS_MESSAGES.sipServer);
  checkHost(errors, "telephony.realm", patch.telephony?.realm, SETTINGS_MESSAGES.realm);
  checkInt(
    errors,
    "backup.periodHours",
    patch.backup?.periodHours,
    L.backupMinPeriodHours,
    N.backupMaxPeriodHours,
    SETTINGS_MESSAGES.backupPeriod,
  );
  checkInt(
    errors,
    "logging.retentionMonths",
    patch.logging?.retentionMonths,
    N.loggingMinRetentionMonths,
    L.loggingMaxRetentionMonths,
    SETTINGS_MESSAGES.loggingRetention,
  );
  if (
    !isBlank(patch.logging?.level) &&
    !(LOG_LEVELS as readonly string[]).includes(patch.logging.level as string)
  ) {
    errors.push({ field: "logging.level", message: SETTINGS_MESSAGES.loggingLevel });
  }
  checkInt(
    errors,
    "performance.sessionLimit",
    patch.performance?.sessionLimit,
    N.sessionLimitMin,
    L.sessionLimitMax,
    SETTINGS_MESSAGES.sessionLimit,
  );
  checkInt(
    errors,
    "performance.refreshIntervalSec",
    patch.performance?.refreshIntervalSec,
    L.refreshMinSec,
    L.refreshMaxSec,
    SETTINGS_MESSAGES.refreshInterval,
  );
  checkInt(
    errors,
    "performance.inputBufferRecords",
    patch.performance?.inputBufferRecords,
    L.bufferMinRecords,
    L.bufferMaxRecords,
    SETTINGS_MESSAGES.inputBuffer,
  );
  checkInt(
    errors,
    "security.minPasswordLength",
    patch.security?.minPasswordLength,
    L.passwordMinLength,
    L.passwordMaxLength,
    SETTINGS_MESSAGES.passwordLength,
  );
  checkInt(
    errors,
    "security.lockAfterAttempts",
    patch.security?.lockAfterAttempts,
    L.lockAttemptsMin,
    L.lockAttemptsMax,
    SETTINGS_MESSAGES.lockAttempts,
  );
  checkInt(
    errors,
    "autoRecovery.restartAttempts",
    patch.autoRecovery?.restartAttempts,
    L.recoveryAttemptsMin,
    L.recoveryAttemptsMax,
    SETTINGS_MESSAGES.recoveryAttempts,
  );
  return errors;
}

/** Проверка целиком сохранённых настроек (дефолты моков обязаны проходить нормативы). */
export function validateSettings(settings: SystemSettings): SettingsFieldError[] {
  return validateSettingsPatch(settings);
}
