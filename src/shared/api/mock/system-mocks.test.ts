// @vitest-environment node
/*
 * T4.2-01 и T4.2-02: сиды раздела «Система» (`mocks/admin/system-*.json`, `monitoring.json`,
 * `usage-stats.json`). Проверяем схемы SystemService/SystemSettings/SystemLogEntry, соответствие
 * дефолтов нормативам ТЗ (§7, §9), ISO-метки со смещением +03:00 и совместимость рядов
 * мониторинга/статистики с props чартов `shared/ui` (ChartData: labels ↔ values одной длины).
 */
import { describe, expect, it } from "vitest";

import { SETTINGS_NORMS } from "../validation/settings";
import {
  readMonitoringMock,
  readSystemIntegrityMock,
  readSystemLogsMock,
  readSystemServicesMock,
  readSystemSettingsMock,
  readUsageStatsMock,
} from "./readers-system";

const MOSCOW_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/;
const SERVICE_ID = /^svc-[a-z]+$/;
const LOG_ID = /^log-\d{3}$/;
const SERVICE_STATES = ["running", "stopped", "degraded"];
const LOG_LEVELS = ["INFO", "WARN", "ERROR"];
const MIN_WINDOW_HOURS = 24;
const MIN_PASSWORD_LENGTH = 6;

describe("mocks/admin/system-services.json (T4.2-01)", () => {
  const services = readSystemServicesMock();

  it("4 сервиса по схеме SystemService: веб-сервер, БД, мок-SIP, ИИ-модуль", () => {
    expect(services).toHaveLength(4);
    expect(services.map((service) => service.id)).toEqual(["svc-web", "svc-db", "svc-sip", "svc-ai"]);
    for (const service of services) {
      expect(service.id).toMatch(SERVICE_ID);
      expect(service.name.length).toBeGreaterThan(0);
      expect(SERVICE_STATES).toContain(service.state);
      expect(Number.isInteger(service.uptimeSec)).toBe(true);
      expect(service.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(typeof service.critical).toBe("boolean");
      expect(service.description.length).toBeGreaterThan(0);
    }
  });

  it("БД помечена критичной, остановленный сервис имеет нулевой аптайм", () => {
    expect(services.find((service) => service.id === "svc-db")?.critical).toBe(true);
    for (const service of services) {
      if (service.state === "stopped") expect(service.uptimeSec).toBe(0);
    }
  });

  it("все три состояния представлены — демо раскраски плиток", () => {
    expect(new Set(services.map((service) => service.state))).toEqual(new Set(SERVICE_STATES));
  });

  it("флаг самопроверки целостности с ISO-меткой +03:00", () => {
    const integrity = readSystemIntegrityMock();
    expect(typeof integrity.ok).toBe("boolean");
    expect(integrity.checkedAt).toMatch(MOSCOW_ISO);
    expect(integrity.details.length).toBeGreaterThan(0);
  });
});

describe("mocks/admin/system-settings.json (T4.2-01)", () => {
  const settings = readSystemSettingsMock();

  it("схема SystemSettings: секции 05 §9 + app-расширения security/performance/autoRecovery", () => {
    expect(Object.keys(settings).sort()).toEqual(
      ["autoRecovery", "backup", "database", "logging", "performance", "security", "telephony"].sort(),
    );
    expect(typeof settings.telephony.sipServer).toBe("string");
    expect(typeof settings.telephony.enabled).toBe("boolean");
    expect(settings.database.name.length).toBeGreaterThan(0);
    expect(LOG_LEVELS).toContain(settings.logging.level);
    expect(settings.backup.lastAt).toMatch(MOSCOW_ISO);
  });

  it("дефолты проходят нормативы ТЗ: бэкап ≤ 24 ч, журналы ≥ 6 мес, сессии ≥ 20", () => {
    expect(settings.backup.periodHours).toBeLessThanOrEqual(SETTINGS_NORMS.backupMaxPeriodHours);
    expect(settings.backup.periodHours).toBeGreaterThan(0);
    expect(settings.logging.retentionMonths).toBeGreaterThanOrEqual(SETTINGS_NORMS.loggingMinRetentionMonths);
    expect(settings.performance.sessionLimit).toBeGreaterThanOrEqual(SETTINGS_NORMS.sessionLimitMin);
  });

  it("безопасность и автовосстановление заполнены правдоподобно", () => {
    expect("require2fa" in settings.security).toBe(false);
    expect(settings.security.minPasswordLength).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(settings.security.lockAfterAttempts).toBeGreaterThanOrEqual(1);
    expect(settings.performance.refreshIntervalSec).toBeGreaterThan(0);
    expect(settings.performance.inputBufferRecords).toBeGreaterThan(0);
    expect(settings.autoRecovery.restartAttempts).toBeGreaterThanOrEqual(1);
  });
});

describe("mocks/admin/system-logs.json (T4.2-01)", () => {
  const logs = readSystemLogsMock();

  it("схема SystemLogEntry, уникальные id и ISO-метки +03:00", () => {
    expect(logs.length).toBeGreaterThan(0);
    for (const entry of logs) {
      expect(entry.id).toMatch(LOG_ID);
      expect(entry.at).toMatch(MOSCOW_ISO);
      expect(LOG_LEVELS).toContain(entry.level);
      expect(entry.source).toMatch(SERVICE_ID);
      expect(entry.message.length).toBeGreaterThan(0);
    }
    expect(new Set(logs.map((entry) => entry.id)).size).toBe(logs.length);
  });

  it("представлены все три уровня, записи упорядочены от новых к старым", () => {
    expect(new Set(logs.map((entry) => entry.level))).toEqual(new Set(LOG_LEVELS));
    const times = logs.map((entry) => Date.parse(entry.at));
    expect([...times].sort((left, right) => right - left)).toEqual(times);
  });

  it("источники логов — сервисы мока или известные подсистемы", () => {
    const known = new Set([...readSystemServicesMock().map((service) => service.id), "svc-backup"]);
    expect(logs.every((entry) => known.has(entry.source))).toBe(true);
  });
});

describe("mocks/admin/monitoring.json (T4.2-02)", () => {
  const monitoring = readMonitoringMock();

  it("ряды покрывают ≥ 24 ч и совместимы с props чартов (labels ↔ values)", () => {
    expect(monitoring.generatedAt).toMatch(MOSCOW_ISO);
    expect(monitoring.windowHours).toBeGreaterThanOrEqual(MIN_WINDOW_HOURS);
    const points = (monitoring.windowHours * 60) / monitoring.stepMinutes + 1;
    expect(monitoring.labels).toHaveLength(points);
    for (const series of Object.values(monitoring.series)) {
      expect(series).toHaveLength(monitoring.labels.length);
      expect(series.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    }
  });

  it("есть участки превышения нормативов ТЗ §7 (20 сессий, отклик 2 с)", () => {
    expect(monitoring.norms).toEqual({ sessionLimit: 20, responseSec: 2 });
    expect(Math.max(...monitoring.series.activeSessions)).toBeGreaterThan(monitoring.norms.sessionLimit);
    expect(Math.max(...monitoring.series.responseSec)).toBeGreaterThan(monitoring.norms.responseSec);
  });

  it("ряды правдоподобны: загрузка в процентах не выходит за 100 (ТЗ §17)", () => {
    expect(Math.max(...monitoring.series.cpuPercent)).toBeLessThanOrEqual(100);
    expect(Math.max(...monitoring.series.memoryPercent)).toBeLessThanOrEqual(100);
    /* Ночной провал нагрузки — иначе ряд «нарисован» под пик, а не снят с системы. */
    expect(Math.min(...monitoring.series.cpuPercent)).toBeLessThan(
      Math.max(...monitoring.series.cpuPercent) / 2,
    );
  });
});

describe("mocks/admin/usage-stats.json (T4.2-02)", () => {
  const stats = readUsageStatsMock();

  it("два периода (неделя/месяц) с ru-подписями", () => {
    expect(stats.periods.map((period) => period.id)).toEqual(["week", "month"]);
    for (const period of stats.periods) expect(period.label).toMatch(/[А-Яа-яЁё]/);
  });

  it("все три диаграммы периода совместимы с ChartData", () => {
    for (const period of stats.periods) {
      expect(period.loginsByRole.labels).toEqual(["Обучающийся", "Преподаватель", "Администратор"]);
      expect(period.loginsByRole.values).toHaveLength(period.loginsByRole.labels.length);
      expect(period.activityByTime.values).toHaveLength(period.activityByTime.labels.length);
      expect(period.cards.created).toHaveLength(period.cards.labels.length);
      expect(period.cards.worked).toHaveLength(period.cards.labels.length);
    }
  });

  it("объёмы месяца не меньше недели, отработано ≤ создано (объективность, ТЗ §17)", () => {
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const [week, month] = stats.periods;
    expect(sum(month.loginsByRole.values)).toBeGreaterThan(sum(week.loginsByRole.values));
    for (const period of stats.periods) {
      period.cards.created.forEach((created, index) => {
        expect(period.cards.worked[index]).toBeLessThanOrEqual(created);
      });
    }
  });
});
