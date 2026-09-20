import type { Scenario, SessionContract } from "@/shared/api";

/**
 * «Следующая карточка» (сценарий В — конвейер занятия): следующая по времени выдачи карточка курсанта
 * в ленте занятия, где есть текущая; иначе — следующая карточка очереди сценария. Нет — null.
 */
export function findNextCardId(
  cardId: string,
  studentId: string,
  sessions: SessionContract[],
  scenario: Scenario | null,
): string | null {
  for (const session of sessions) {
    const flow = session.cardFlow
      .filter((item) => item.studentId === studentId)
      .sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt));
    const index = flow.findIndex((item) => item.cardId === cardId);
    if (index >= 0) return flow.slice(index + 1).find((item) => item.cardId !== cardId)?.cardId ?? null;
  }
  if (!scenario) return null;
  const index = scenario.cardIds.indexOf(cardId);
  return index >= 0 ? (scenario.cardIds[index + 1] ?? null) : null;
}
