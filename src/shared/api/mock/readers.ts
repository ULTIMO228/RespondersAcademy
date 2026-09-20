/*
 * Ридеры коллекций мок-слоя (только сервер: route handlers и логика src/shared/api/mock/**).
 *
 * Способ импорта JSON на проект — один: resolveJsonModule + алиас @mocks/* (синхронизированная копия
 * spec/mocks → mocks/, `npm run mocks:sync`); к spec/mocks/ код приложения не обращается.
 * Мемоизация на процесс: копия JSON снимается и глубоко замораживается один раз при первом чтении.
 * Мутация данных ридеров ЗАПРЕЩЕНА (Object.freeze → TypeError в strict-режиме); изменяемое состояние —
 * только в in-memory store (store.ts), который сидируется глубокой копией.
 */
import auditLogJson from "@mocks/admin/audit-log.json";
import armCardsJson from "@mocks/fixtures/arm-cards.json";
import cardsJson from "@mocks/cards.json";
import classifierJson from "@mocks/classifier.json";
import referenceJson from "@mocks/reference.json";
import reportsJson from "@mocks/reports.json";
import scenariosJson from "@mocks/scenarios.json";
import sessionsJson from "@mocks/sessions.json";
import usersJson from "@mocks/users.json";

import type {
  ArmCardFixture,
  AuditLogEntry,
  ClassifierEntry,
  ClassifierMeta,
  GroupReport,
  IncidentCard,
  ReferenceData,
  Report,
  Scenario,
  Session,
  User,
} from "../types";

function deepFreeze<TValue>(value: TValue): TValue {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

/** Ленивая мемоизированная замороженная копия (исходный модуль JSON не трогаем — им пользуется mocks.ts). */
function memoizeFrozen<TValue>(load: () => TValue): () => TValue {
  let cached: TValue | undefined;
  return () => {
    if (cached === undefined) cached = deepFreeze(structuredClone(load()));
    return cached;
  };
}

/*
 * Приведение JSON → контрактные типы: `as` (TS проверяет совместимость форм); фактическое соответствие
 * значений (enum-ы, id-форматы, объёмы) закреплено тестами readers.test.ts.
 */
export const readUsers = memoizeFrozen((): readonly User[] => usersJson.users as User[]);

export const readReference = memoizeFrozen((): ReferenceData => referenceJson as ReferenceData);

export const readClassifier = memoizeFrozen(
  (): readonly ClassifierEntry[] => classifierJson.entries as ClassifierEntry[],
);

export const readClassifierMeta = memoizeFrozen((): ClassifierMeta => classifierJson.meta);

export const readCards = memoizeFrozen((): readonly IncidentCard[] => cardsJson.cards as IncidentCard[]);

export const readScenarios = memoizeFrozen((): readonly Scenario[] => scenariosJson.scenarios as Scenario[]);

export const readSessions = memoizeFrozen((): readonly Session[] => sessionsJson.sessions as Session[]);

export const readReports = memoizeFrozen((): readonly Report[] => reportsJson.reports as Report[]);

export const readGroupReport = memoizeFrozen((): GroupReport => reportsJson.groupReport as GroupReport);

export const readArmFixtures = memoizeFrozen(
  (): readonly ArmCardFixture[] => armCardsJson.cards as ArmCardFixture[],
);

/** Сид журнала аудита (T4.1-01): мок уровня приложения, от новых записей к старым. */
export const readAuditLog = memoizeFrozen(
  (): readonly AuditLogEntry[] => auditLogJson.auditLog as AuditLogEntry[],
);
