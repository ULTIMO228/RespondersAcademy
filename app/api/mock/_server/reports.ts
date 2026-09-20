/*
 * Серверная сборка формирования отчёта занятия по рантайм-данным (reports-runtime.ts).
 * src/shared/api/mock не импортирует entities (FSD), поэтому доменные функции приходят отсюда:
 *   - оценка попытки — AiGateway.evaluateAttempt → entities/report getAttemptEvaluation (T1.2-08/10);
 *   - нормативы этапов — entities/session resolveTimeNorms по сценарию занятия (30 / 180 сек по умолчанию);
 *   - инсайты группы — AiGateway.groupInsights (для занятий мока — из reports.json).
 */
import { resolveTimeNorms } from "@/entities/session";
import type { CardEventContract, Scenario, SessionContract } from "@/shared/api";
import { ensureSessionReport, listStoredScenarios } from "@/shared/api/mock";
import type { RuntimeReportDeps, RuntimeTimeNorms } from "@/shared/api/mock";

import { getServerAiGateway } from "./ai-gateway";

/** Сценарий-эталон карточки: первый из scenarioIds занятия с этой карточкой, иначе любой с ней. */
function findScenarioForCard(session: SessionContract, cardId: string): Scenario | undefined {
  const scenarios = listStoredScenarios();
  const ofSession = session.scenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id))
    .find((scenario) => scenario?.cardIds.includes(cardId));
  return ofSession ?? scenarios.find((scenario) => scenario.cardIds.includes(cardId));
}

function resolveAttemptNorms(session: SessionContract, attempt: CardEventContract): RuntimeTimeNorms {
  return resolveTimeNorms(findScenarioForCard(session, attempt.cardId));
}

/** Зависимости сборки отчёта — один набор на процесс; данные шлюз читает лениво, при каждом вызове. */
const runtimeReportDeps: RuntimeReportDeps = {
  evaluateAttempt: async (attemptId) => (await getServerAiGateway().evaluateAttempt(attemptId)).data,
  resolveAttemptNorms,
  groupInsights: async (sessionId) => (await getServerAiGateway().groupInsights(sessionId)).data,
};

export function getRuntimeReportDeps(): RuntimeReportDeps {
  return runtimeReportDeps;
}

/** «Сформировать отчёт» (POST /sessions/[id]/control {action:"report"}) и ленивое формирование при чтении. */
export function buildSessionReport(sessionId: string): Promise<void> {
  return ensureSessionReport(sessionId, getRuntimeReportDeps());
}
