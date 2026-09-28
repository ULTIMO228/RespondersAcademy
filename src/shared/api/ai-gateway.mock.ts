/*
 * MockAiGateway — детерминированная заглушка ИИ локального контура (T1.2-10): без сети, без случайности.
 * ИИ-модуль: заменить на реальный сервис (реализовать AiGateway и передать вместо MockAiGateway).
 * shared не импортирует entities: оценку попытки (entities/report → getAttemptEvaluation) и данные
 * отчётов передаёт вызывающий серверный код через зависимости.
 */
import { checkGrammarText } from "@/shared/lib";

import type { AiGateway, AiResponse } from "./ai-gateway";
import type { Evaluation, GroupReport, Scenario } from "./types";

export type MockAiGatewayDeps = {
  /** Делегат мок-оценки T1.2-08; null — оценка недоступна. */
  evaluateAttempt: (cardEventId: string) => Evaluation | null;
  /** Групповые отчёты (mocks/reports.json → groupReport) — источник инсайтов. */
  groupReports: readonly GroupReport[];
};

/** Нормативы заказчика в секундах (spec/000-фронт/05-data-models.md §6: timeNorms 30 / 180). */
const GENERATED_PRIMARY_REACTION_SEC = 30;
const GENERATED_FULL_PROCESSING_SEC = 180;
/** Базовое число вариаций и разброс (итого 2–3 сценария на категорию). */
const MIN_GENERATED_SCENARIOS = 2;
const GENERATED_SCENARIOS_SPREAD = 2;
/** Сложность вариаций: генеративные сценарии — уровень advanced (difficulty 3–5). */
const GENERATED_DIFFICULTIES = [3, 4, 5] as const;
const GENERATED_MAX_GRAMMAR_ERRORS = 1;
/** Сценарий не из билета ДДС. */
const NO_SOURCE_TICKET = 0;
const HASH_MULTIPLIER = 31;
const HASH_MODULO = 2_147_483_647;
const HASH_RADIX = 36;

function wrap<TData>(data: TData): AiResponse<TData> {
  return { origin: "ai", provider: "mock", data };
}

/** Стабильный хеш строки (детерминированные id и число вариаций). */
function hashText(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * HASH_MULTIPLIER + (char.codePointAt(0) ?? 0)) % HASH_MODULO;
  return hash;
}

function buildGeneratedScenario(category: string, index: number): Scenario {
  const variant = index + 1;
  return {
    id: `s-gen-${hashText(category).toString(HASH_RADIX)}-${variant}`,
    title: `Вариация ${variant} (ИИ): ${category}`,
    level: "advanced",
    sourceTicketNo: NO_SOURCE_TICKET,
    cardIds: [],
    timeNorms: {
      primaryReactionSec: GENERATED_PRIMARY_REACTION_SEC,
      fullProcessingSec: GENERATED_FULL_PROCESSING_SEC,
    },
    hints: { enabled: false, texts: [] },
    difficulty: GENERATED_DIFFICULTIES[index % GENERATED_DIFFICULTIES.length],
    etalon: {
      expectedActions: ["status:accepted", "status:workDone"],
      keyPhrases: ["сообщение принято", category],
    },
    validation: { status: "pending" },
    successCriteria: {
      maxGrammarErrors: GENERATED_MAX_GRAMMAR_ERRORS,
      requiredFields: ["dispatcherAction", "outfitNumber"],
      syntaxRequirements: "Полные предложения, без сокращений",
    },
    source: "generated",
  };
}

export class MockAiGateway implements AiGateway {
  constructor(private readonly deps: MockAiGatewayDeps) {}

  // ИИ-модуль: заменить на реальный сервис (оценка попытки по эталону).
  async evaluateAttempt(cardEventId: string) {
    return wrap(this.deps.evaluateAttempt(cardEventId));
  }

  // ИИ-модуль: заменить на реальный сервис (генерация сценариев-вариаций; утверждает преподаватель).
  async generateScenario(category: string) {
    const normalized = category.trim();
    if (normalized === "") return wrap<Scenario[]>([]);
    const count = MIN_GENERATED_SCENARIOS + (hashText(normalized) % GENERATED_SCENARIOS_SPREAD);
    return wrap(Array.from({ length: count }, (_, index) => buildGeneratedScenario(normalized, index)));
  }

  // ИИ-модуль: заменить на реальный сервис (проверка грамматики ручного ввода).
  async checkGrammar(text: string, field?: string) {
    return wrap(checkGrammarText(text, field));
  }

  // ИИ-модуль: заменить на реальный сервис (инсайты группы по занятию).
  async groupInsights(sessionId: string) {
    const report = this.deps.groupReports.find((item) => item.sessionId === sessionId);
    return wrap(report ? [...report.groupInsights] : []);
  }
}

/** Фабрика для инъекции: вызывающий код зависит от AiGateway, а не от мок-реализации. */
export function createMockAiGateway(deps: MockAiGatewayDeps): AiGateway {
  return new MockAiGateway(deps);
}
