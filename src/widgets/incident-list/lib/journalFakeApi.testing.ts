/*
 * Тестовая подмена клиента мок-слоя для ленты (RTL-тесты вместо браузера/HTTP, BRIEF волны 2).
 * Данные — JSON-моки (@mocks), поведение повторяет контракт /api/mock: пагинация после фильтров, view,
 * dataset, окно ленты занятия (since, at], read-only связи по duplicateOf. Только для *.test.tsx.
 */
import armCardsJson from "@mocks/fixtures/arm-cards.json";
import cardsJson from "@mocks/cards.json";
import referenceJson from "@mocks/reference.json";
import scenariosJson from "@mocks/scenarios.json";
import sessionsJson from "@mocks/sessions.json";
import type {
  ArmCardFixtureContract,
  CardDetails,
  CardsQuery,
  IncidentCard,
  ReferenceData,
  Scenario,
  SessionContract,
  SessionCreateRequest,
  SessionFeedEvent,
} from "@/shared/api";
import { createMemoryStorage } from "@/shared/lib";

import type { JournalApi, JournalDeps } from "../model/deps";
import { silentPlayer } from "./sound";
import { toMoscowIso } from "./time";

export const FIXTURES = armCardsJson.cards as unknown as ArmCardFixtureContract[];
export const TRAINING = cardsJson.cards as unknown as IncidentCard[];
export const REFERENCE = referenceJson as unknown as ReferenceData;
export const SCENARIOS = scenariosJson.scenarios as unknown as Scenario[];
export const SESSIONS = sessionsJson.sessions as unknown as SessionContract[];

const EMPTY_RUNTIME = { statusEvents: [], workLines: [], reminders: [], sms: [] };
const DEFAULT_PER_PAGE = 10;

/** Учебная карточка в списке — копия фикстуры с id/номером учебной (как projectTrainingCard мок-слоя). */
function projectTraining(card: IncidentCard): ArmCardFixtureContract {
  const base = FIXTURES[0];
  return { ...base, id: card.id, number: Number(card.id.replace(/\D/g, "")), smsList: [] };
}

function listSource(query: CardsQuery): ArmCardFixtureContract[] {
  const training = TRAINING.filter((card) => ["c-003", "c-047"].includes(card.id)).map(projectTraining);
  if (query.dataset === "fixtures") return FIXTURES;
  return [...FIXTURES, ...training];
}

function matchesQuery(card: ArmCardFixtureContract, query: CardsQuery): boolean {
  if (query.view === "sms" && (card.smsList ?? []).length === 0) return false;
  if (query.view === "empty") return false;
  if (typeof query.cardNumber === "string" && !String(card.number).includes(query.cardNumber)) return false;
  return true;
}

function feedEventsOf(session: SessionContract, since: string | undefined, at: string): SessionFeedEvent[] {
  return session.cardFlow
    .filter((item) => Date.parse(item.issuedAt) <= Date.parse(at))
    .filter((item) => !since || Date.parse(item.issuedAt) > Date.parse(since))
    .map((item) => ({
      kind: "cardIssued",
      at: item.issuedAt,
      studentId: item.studentId,
      cardId: item.cardId,
      level: item.level,
    }));
}

export type FakeJournalApi = JournalApi & {
  calls: { getCards: CardsQuery[]; createSession: SessionCreateRequest[]; feed: number };
  sessions: Map<string, SessionContract>;
};

export function createFakeJournalApi(): FakeJournalApi {
  const calls = { getCards: [] as CardsQuery[], createSession: [] as SessionCreateRequest[], feed: 0 };
  const sessions = new Map<string, SessionContract>();
  let reminderSeq = 0;
  const api: JournalApi = {
    getReference: async () => REFERENCE,
    getCards: async (query = {}) => {
      calls.getCards.push(query);
      const matched = listSource(query)
        .filter((card) => matchesQuery(card, query))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const page = Number(query.page ?? 1);
      const perPage = Number(query.perPage ?? DEFAULT_PER_PAGE);
      return {
        items: matched.slice((page - 1) * perPage, page * perPage),
        total: matched.length,
        page,
        perPage,
      };
    },
    getCard: async (cardId): Promise<CardDetails> => {
      const training = TRAINING.find((card) => card.id === cardId);
      if (training)
        return { kind: "training", card: training, resolvedFixtureId: null, runtime: EMPTY_RUNTIME };
      const fixture = FIXTURES.find((card) => card.id === cardId) as ArmCardFixtureContract;
      return { kind: "fixture", card: fixture, runtime: EMPTY_RUNTIME };
    },
    postCardLinks: async (cardId) => {
      const card = TRAINING.find((candidate) => candidate.id === cardId);
      const rootId = card?.duplicateOf ?? cardId;
      const subordinates = TRAINING.filter((candidate) => candidate.duplicateOf === rootId);
      if (subordinates.length === 0) return { cardId, chain: [] };
      const chain = subordinates.map((item) => ({ cardId: item.id, role: "subordinate" as const }));
      return { cardId, chain: [{ cardId: rootId, role: "main" as const }, ...chain] };
    },
    postCardReminder: async (cardId, body) => {
      reminderSeq += 1;
      return { id: `rem-${reminderSeq}`, cardId, ...body, createdAt: toMoscowIso(Date.now()) };
    },
    listSessions: async (query) =>
      SESSIONS.filter((session) => session.studentIds.includes(query?.studentId ?? "")),
    listScenarios: async (query) =>
      SCENARIOS.filter((scenario) => scenario.validation.status === (query?.validationStatus ?? "approved")),
    createSession: async (body) => {
      calls.createSession.push(body);
      const session: SessionContract = {
        ...body,
        id: `ses-test-${sessions.size + 1}`,
        cardFlow: body.cardFlow ?? [],
        state: "configured",
        startedAt: toMoscowIso(Date.now()),
        finishedAt: null,
        cardEvents: [],
      };
      sessions.set(session.id, session);
      return session;
    },
    startSession: async (sessionId) => {
      const session = { ...(sessions.get(sessionId) as SessionContract), state: "running" as const };
      sessions.set(sessionId, { ...session, startedAt: toMoscowIso(Date.now()) });
      return sessions.get(sessionId) as SessionContract;
    },
    getSessionFeed: async (sessionId, query) => {
      calls.feed += 1;
      const at = toMoscowIso(Date.now());
      const session = sessions.get(sessionId) as SessionContract;
      return { sessionId, at, events: feedEventsOf(session, query?.since, at) };
    },
  };
  return { ...api, calls, sessions };
}

/** Зависимости ленты для тестов: фейковый API, системные часы (vi.useFakeTimers), память, без звука. */
export function createTestDeps(overrides: Partial<JournalDeps> = {}): JournalDeps & { api: FakeJournalApi } {
  return {
    api: createFakeJournalApi(),
    clock: { now: () => Date.now(), setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout },
    storage: createMemoryStorage(),
    sound: silentPlayer,
    prefersReducedMotion: () => false,
    ...overrides,
  } as JournalDeps & { api: FakeJournalApi };
}
