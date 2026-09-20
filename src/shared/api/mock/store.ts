/*
 * In-memory store мутаций мок-слоя (все POST-эндпоинты пишут сюда, GET накладывают поверх моков).
 *
 * ДОПУЩЕНИЕ: store живёт в одном Node-процессе dev-сервера; персистентность не требуется
 * (перезапуск сервера = возврат к мокам). Экземпляр хранится на globalThis, чтобы HMR и раздельные
 * бандлы route handlers Next.js видели одно и то же состояние.
 * Seed — глубокая копия данных ридеров (исходные JSON не мутируются); resetMockStore() — возврат к мокам.
 * Наружу store отдаёт копии (structuredClone): менять состояние — только функциями store-*.ts.
 */
import type {
  AuditLogEntry,
  CardFlowItem,
  CardRuntimeState,
  GroupReport,
  ProfileMappingRow,
  Report,
  ReportFeedback,
  Scenario,
  Session,
  SessionPlan,
  SystemIntegrity,
  SystemLogEntry,
  SystemService,
  SystemSettings,
  TrainingMaterial,
  User,
} from "../types";
import { createSeedCollections } from "./store-seed";

/**
 * Настройки мастера и состояние выдачи занятия (T3.2-02, T3.2-11). Рядом с Session, а не внутри:
 * контракт Session (spec/05-data-models.md §7) этих полей не содержит.
 */
export interface StoredSessionPlan {
  plan: SessionPlan;
  /** Момент паузы выдачи (ISO +03:00); null — выдача идёт. */
  pausedAt: string | null;
  /** Отложенные паузой выдачи: возвращаются в cardFlow со сдвигом при снятии паузы. */
  parked: CardFlowItem[];
}

export interface MockStoreState {
  users: User[];
  scenarios: Scenario[];
  sessions: Session[];
  /** Мутации карточек по id (оба пространства: "card-*" и "c-NNN"). */
  cardRuntime: Record<string, CardRuntimeState>;
  systemServices: SystemService[];
  /** Учебные материалы-заглушки, загруженные преподавателем (T3.1-07). */
  materials: TrainingMaterial[];
  /** Привязка «служба/группа курсантов → профильные группы ЕКП» (T3.1-09). */
  profileMapping: ProfileMappingRow[];
  /** Обратная связь преподавателя по отчётам (T3.4-10), по одной записи на отчёт. */
  reportFeedback: ReportFeedback[];
  /** Отчёты занятий, сформированные по рантайм-данным (в reports.json их нет). */
  reports: Report[];
  /** Групповые своды рантайм-занятий, по одному на занятие. */
  groupReports: GroupReport[];
  /** План мастера и состояние выдачи по id занятия (T3.2-02). */
  sessionPlans: Record<string, StoredSessionPlan>;
  auditLog: AuditLogEntry[];
  settings: SystemSettings;
  /** Лента системных журналов (T4.2-01): сид mocks/admin/system-logs.json + рантайм-события. */
  systemLogs: SystemLogEntry[];
  /** Сводка самопроверки целостности (T4.2-10). */
  systemIntegrity: SystemIntegrity;
  /** Счётчики id по префиксу (см. MOCK_ID_PREFIX). */
  idCounters: Record<string, number>;
}

/** Префиксы id записей, создаваемых мок-слоем. */
export const MOCK_ID_PREFIX = {
  statusEvent: "st",
  workLine: "wl",
  reminder: "rem",
  sms: "sms",
  audit: "audit",
  systemLog: "log",
  user: "u",
  material: "mat",
  scenario: "s",
  session: "ses",
  attempt: "att",
  call: "call",
} as const;

export type MockIdPrefix = (typeof MOCK_ID_PREFIX)[keyof typeof MOCK_ID_PREFIX];

const STORE_KEY = Symbol.for("arm112.mockStore");
const ID_PAD_LENGTH = 3;
const NUMERIC_SUFFIX = /-(\d+)$/;

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: MockStoreState };

/** Максимальный числовой суффикс среди id вида "<prefix>-NNN" — чтобы новые id не пересекались с моками. */
function maxIdSuffix(ids: readonly string[], prefix: string): number {
  return ids.reduce((max, id) => {
    const match = id.startsWith(`${prefix}-`) ? NUMERIC_SUFFIX.exec(id) : null;
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function createSeedState(): MockStoreState {
  const collections = createSeedCollections();
  const attemptIds = collections.sessions.flatMap((session) => session.cardEvents.map((event) => event.id));
  return {
    ...collections,
    idCounters: {
      [MOCK_ID_PREFIX.scenario]: maxIdSuffix(
        collections.scenarios.map((scenario) => scenario.id),
        MOCK_ID_PREFIX.scenario,
      ),
      [MOCK_ID_PREFIX.attempt]: maxIdSuffix(attemptIds, MOCK_ID_PREFIX.attempt),
      // Продолжают нумерацию сидов: пользователи — users.json (u-024), аудит — mocks/admin/audit-log.json.
      [MOCK_ID_PREFIX.user]: maxIdSuffix(
        collections.users.map((user) => user.id),
        MOCK_ID_PREFIX.user,
      ),
      [MOCK_ID_PREFIX.audit]: maxIdSuffix(
        collections.auditLog.map((entry) => entry.id),
        MOCK_ID_PREFIX.audit,
      ),
      // Системные журналы (T4.2-01): нумерация продолжает mocks/admin/system-logs.json.
      [MOCK_ID_PREFIX.systemLog]: maxIdSuffix(
        collections.systemLogs.map((entry) => entry.id),
        MOCK_ID_PREFIX.systemLog,
      ),
    },
  };
}

/** Живое состояние store (ленивая инициализация). Только для модулей store-*.ts. */
export function getMockState(): MockStoreState {
  const holder = globalThis as GlobalWithStore;
  holder[STORE_KEY] ??= createSeedState();
  return holder[STORE_KEY];
}

/** Возврат к состоянию моков (тесты — в beforeEach; демо — сброс). */
export function resetMockStore(): void {
  (globalThis as GlobalWithStore)[STORE_KEY] = createSeedState();
}

/** Следующий id с префиксом: "wl-001", "s-037" (продолжает нумерацию моков). */
export function nextMockId(prefix: MockIdPrefix): string {
  const state = getMockState();
  const next = (state.idCounters[prefix] ?? 0) + 1;
  state.idCounters[prefix] = next;
  return `${prefix}-${String(next).padStart(ID_PAD_LENGTH, "0")}`;
}

/** Копия значения для отдачи из store (внешний код не держит ссылок на живое состояние). */
export function cloneOut<TValue>(value: TValue): TValue {
  return structuredClone(value);
}
