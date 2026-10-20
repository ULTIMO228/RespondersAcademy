import type { StudentCardDecision, StudentCardEtalon } from "@/shared/api";

/** Подписи первичных статусов ДДС — как в АРМ-112 (reference.ddsStatuses). */
export const DECISION_TITLES: Record<StudentCardDecision, string> = {
  accepted: "Принята",
  notAccepted: "Не принята",
};

/** Строка эталона для шага «Проверка»: «c-901: Не принята → УК «ПИК»». */
export function describeEtalon(etalon: StudentCardEtalon): string {
  const title = DECISION_TITLES[etalon.expectedDecision];
  const target = etalon.expectedTransferTo?.trim();
  return etalon.expectedDecision === "notAccepted" && target
    ? `${etalon.cardId}: ${title} → ${target}`
    : `${etalon.cardId}: ${title}`;
}
