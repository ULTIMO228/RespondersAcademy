/*
 * Сид in-memory store: глубокие копии ридеров + мок-состояния админки (журнал аудита — из
 * mocks/admin/audit-log.json, T4.1-01; сервисы, настройки и системные журналы — из mocks/admin/*.json,
 * T4.2-01, см. spec/000-фронт/05-data-models.md §9 и 21-admin-system.md §1/§3).
 */
import { PROFILE_MAPPING_SEED } from "@/shared/config";

import type { CardRuntimeState, CardSms, ProfileMappingRow, SystemService, SystemSettings } from "../types";
import { readArmFixtures, readAuditLog, readScenarios, readSessions, readUsers } from "./readers";
import { readSystemIntegrityMock, readSystemLogsMock } from "./readers-system";
import { readSystemServicesMock, readSystemSettingsMock } from "./readers-system";

export const SEED_SYSTEM_SERVICES: readonly SystemService[] = readSystemServicesMock();

export const SEED_SYSTEM_SETTINGS: SystemSettings = readSystemSettingsMock();

export function createEmptyCardRuntime(): CardRuntimeState {
  return { statusEvents: [], workLines: [], reminders: [], sms: [] };
}

/** Входящие SMS фикстур (smsList) — стартовая переписка карточки; id: sms-<cardId>-<n>. */
function seedFixtureSms(): Record<string, CardRuntimeState> {
  const runtimeByCard: Record<string, CardRuntimeState> = {};
  for (const fixture of readArmFixtures()) {
    if (!fixture.smsList?.length) continue;
    const sms: CardSms[] = fixture.smsList.map((text, index) => ({
      id: `sms-${fixture.id}-${index + 1}`,
      cardId: fixture.id,
      direction: "incoming",
      text,
      at: fixture.createdAt,
      phone: fixture.phones.aon,
    }));
    runtimeByCard[fixture.id] = { ...createEmptyCardRuntime(), sms };
  }
  return runtimeByCard;
}

/**
 * Привязка профильных категорий (T3.1-09): сид — `PROFILE_MAPPING_SEED` из shared/config,
 * studentCount считается по users.json (курсанты с этим User.service).
 */
function seedProfileMapping(): ProfileMappingRow[] {
  const students = readUsers().filter((user) => user.role === "student");
  return PROFILE_MAPPING_SEED.map((row) => ({
    ...row,
    incidentGroups: [...row.incidentGroups],
    serviceIds: [...row.serviceIds],
    studentCount: students.filter((user) => user.service === row.profile).length,
  }));
}

export function createSeedCollections() {
  return {
    users: structuredClone([...readUsers()]),
    scenarios: structuredClone([...readScenarios()]),
    sessions: structuredClone([...readSessions()]),
    cardRuntime: seedFixtureSms(),
    systemServices: structuredClone([...SEED_SYSTEM_SERVICES]),
    // Учебные материалы (T3.1-07) — рантайм: файлов-заглушек в mocks/ нет.
    materials: [],
    profileMapping: seedProfileMapping(),
    // Обратная связь преподавателя курсанту (T3.4-10) — рантайм: в reports.json её нет.
    reportFeedback: [],
    // Отчёты занятий, проведённых в этом процессе: формируются по попыткам при переходе в reported.
    reports: [],
    groupReports: [],
    // Планы мастера занятия (T3.2-02) — рантайм: занятия моков созданы без мастера.
    sessionPlans: {},
    // Журнал аудита (T4.1-01): сид mocks/admin/audit-log.json; рантайм-события добавляются сверху.
    auditLog: structuredClone([...readAuditLog()]),
    settings: structuredClone(SEED_SYSTEM_SETTINGS),
    // Раздел «Система» (T4.2-01): лента журналов и сводка самопроверки целостности.
    systemLogs: structuredClone([...readSystemLogsMock()]),
    systemIntegrity: structuredClone(readSystemIntegrityMock()),
  };
}
