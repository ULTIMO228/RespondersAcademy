/*
 * AiGateway — единая точка имитации ИИ-модулей (spec/03-architecture.md → «Имитация ИИ-модулей», T1.2-10).
 * ИИ-модуль: заменить на реальный сервис. Реализация подменяется инъекцией (вызывающий код работает
 * с интерфейсом), ответы несут маркер ИИ-происхождения — UI обязан показать бейдж «ИИ»; приоритет —
 * у преподавателя (Evaluation.teacherOverride, Scenario.validation).
 */
import type { Evaluation, GrammarError, Scenario } from "./types";

/** Кто сформировал ответ: мок-заглушка локального контура или реальный сервис. */
export type AiProvider = "mock" | "service";

/** Ответ ИИ-модуля с маркером происхождения (контракт бейджа «ИИ» в UI). */
export type AiResponse<TData> = {
  origin: "ai";
  provider: AiProvider;
  data: TData;
};

export interface AiGateway {
  /** Оценка попытки по CardEvent.id (T1.2-08); null — попытка не найдена или нет эталона. */
  evaluateAttempt(cardEventId: string): Promise<AiResponse<Evaluation | null>>;
  /** 2–3 сценария-вариации по группе происшествий: validation.status = 'pending', source = 'generated'. */
  generateScenario(category: string): Promise<AiResponse<Scenario[]>>;
  /** Грамматические ошибки ручного ввода (type: 'spelling' | 'syntax'). */
  checkGrammar(text: string, field?: string): Promise<AiResponse<GrammarError[]>>;
  /** Инсайты группы по занятию (GroupReport.groupInsights). */
  groupInsights(sessionId: string): Promise<AiResponse<string[]>>;
}
