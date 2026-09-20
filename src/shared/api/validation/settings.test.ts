// @vitest-environment node
/*
 * T4.2-04: границы нормативов ТЗ §7/§9 в правилах shared/api/validation (happy / edge / error).
 * Те же правила работают на сервере (PATCH → 422) и в формах вкладки «Настройки».
 */
import { describe, expect, it } from "vitest";

import { SEED_SYSTEM_SETTINGS } from "../mock";
import { SETTINGS_NORMS, validateSettings, validateSettingsPatch } from "./settings";

const fields = (patch: Parameters<typeof validateSettingsPatch>[0]) =>
  validateSettingsPatch(patch).map((error) => error.field);

describe("валидация системных настроек", () => {
  it("дефолты моков проходят нормативы ТЗ (бэкап ≤ 24 ч, журналы ≥ 6 мес, сессии ≥ 20)", () => {
    expect(validateSettings(SEED_SYSTEM_SETTINGS)).toEqual([]);
    expect(SEED_SYSTEM_SETTINGS.backup.periodHours).toBeLessThanOrEqual(SETTINGS_NORMS.backupMaxPeriodHours);
    expect(SEED_SYSTEM_SETTINGS.logging.retentionMonths).toBeGreaterThanOrEqual(
      SETTINGS_NORMS.loggingMinRetentionMonths,
    );
    expect(SEED_SYSTEM_SETTINGS.performance.sessionLimit).toBeGreaterThanOrEqual(
      SETTINGS_NORMS.sessionLimitMin,
    );
  });

  it("бэкап: 24 ч — граница допустима, 48 ч и 0 — ошибка (ТЗ §9)", () => {
    expect(fields({ backup: { periodHours: 24 } })).toEqual([]);
    expect(fields({ backup: { periodHours: 12 } })).toEqual([]);
    expect(fields({ backup: { periodHours: 48 } })).toEqual(["backup.periodHours"]);
    expect(fields({ backup: { periodHours: 0 } })).toEqual(["backup.periodHours"]);
  });

  it("журналы: 6 месяцев — граница допустима, 3 — ошибка (ТЗ §9)", () => {
    expect(fields({ logging: { retentionMonths: 6 } })).toEqual([]);
    expect(fields({ logging: { retentionMonths: 3 } })).toEqual(["logging.retentionMonths"]);
    expect(fields({ logging: { level: "TRACE" as never } })).toEqual(["logging.level"]);
  });

  it("сессии: 20 — граница допустима, 10 — ошибка с текстом норматива (ТЗ §7)", () => {
    expect(fields({ performance: { sessionLimit: 20 } })).toEqual([]);
    const errors = validateSettingsPatch({ performance: { sessionLimit: 10 } });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("20 одновременных сессий");
    expect(errors[0].message).toContain("ТЗ §7");
  });

  it("безопасность и производительность: диапазоны полей", () => {
    expect(fields({ security: { minPasswordLength: 4 } })).toEqual(["security.minPasswordLength"]);
    expect(fields({ security: { minPasswordLength: 8, lockAfterAttempts: 0 } })).toEqual([
      "security.lockAfterAttempts",
    ]);
    expect(fields({ performance: { refreshIntervalSec: 0 } })).toEqual(["performance.refreshIntervalSec"]);
    expect(fields({ performance: { inputBufferRecords: 10 } })).toEqual(["performance.inputBufferRecords"]);
    expect(fields({ autoRecovery: { restartAttempts: 9 } })).toEqual(["autoRecovery.restartAttempts"]);
  });

  it("телефония: хост и realm проверяются по формату", () => {
    expect(fields({ telephony: { sipServer: "sip.arm112.local:5060", realm: "arm112.local" } })).toEqual([]);
    expect(fields({ telephony: { sipServer: "не хост" } })).toEqual(["telephony.sipServer"]);
  });

  it("пустой патч и несколько нарушений сразу", () => {
    expect(validateSettingsPatch({})).toEqual([]);
    expect(fields({ backup: { periodHours: 48 }, logging: { retentionMonths: 1 } })).toEqual([
      "backup.periodHours",
      "logging.retentionMonths",
    ]);
  });
});
