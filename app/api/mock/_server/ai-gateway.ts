/*
 * Серверная сборка ИИ-шлюза мок-слоя (T1.2-10). ИИ-модуль: заменить на реальный сервис — подменить
 * createMockAiGateway на реализацию AiGateway; эндпоинты работают с интерфейсом и не меняются.
 * Данные — рантайм-store мок-слоя (занятия/сценарии с мутациями) и reports.json (инсайты группы).
 */
import { getAttemptEvaluation } from "@/entities/report";
import { createMockAiGateway } from "@/shared/api";
import type { AiGateway, Evaluation } from "@/shared/api";
import { listStoredScenarios, listStoredSessions, readGroupReport } from "@/shared/api/mock";

/** Мок-оценка попытки (T1.2-08): готовая из занятия или сгенерированная по эталону; иначе null. */
export function evaluateStoredAttempt(cardEventId: string): Evaluation | null {
  const lookup = getAttemptEvaluation(cardEventId, {
    sessions: listStoredSessions(),
    scenarios: listStoredScenarios(),
  });
  return lookup.status === "ready" ? lookup.evaluation : null;
}

let serverAiGateway: AiGateway | undefined;

/** Единственный экземпляр шлюза процесса мок-сервера (данные читает лениво, при каждом вызове). */
export function getServerAiGateway(): AiGateway {
  serverAiGateway ??= createMockAiGateway({
    evaluateAttempt: evaluateStoredAttempt,
    groupReports: [readGroupReport()],
  });
  return serverAiGateway;
}
