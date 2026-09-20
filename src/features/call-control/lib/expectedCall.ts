/*
 * Контекстная подсказка ожидаемого номера точки C по текущей карточке (T2.4-03), по приоритету:
 *   1) эталон сценария — действия «call:NNN» сегмента карточки (Etalon.expectedActions);
 *   2) главная служба карточки — отметка «(главная)» в IncidentCard.expectedServices → учебный номер службы;
 *   3) Scenario.callTarget.
 * Номер подсвечивается, только если он есть в справочнике internalNumbers.
 */
import { getCardEtalonSegment, parseEtalonAction } from "@/entities/session";
import type { IncidentCard, InternalNumber, Scenario } from "@/shared/api";

export type ExpectedCallSource = "etalon" | "mainService" | "callTarget";

export type ExpectedCall = {
  cardId: string;
  numbers: string[];
  source: ExpectedCallSource;
};

export type ExpectedCallInput = {
  cardId: string;
  card: IncidentCard | null;
  scenarios: readonly Scenario[];
  numbers: readonly InternalNumber[];
};

const CALL_ACTION = "call";
const MAIN_SERVICE_MARK = "(главная)";
const LEADING_NUMBER = /^\s*(\d{3,4})/;

function inDirectory(candidates: readonly string[], numbers: readonly InternalNumber[]): string[] {
  const known = new Set(numbers.map((entry) => entry.number));
  return [...new Set(candidates)].filter((number) => known.has(number));
}

function fromEtalon(scenario: Scenario | undefined, cardId: string): string[] {
  const segment = getCardEtalonSegment(scenario?.etalon.expectedActions ?? [], cardId);
  return segment
    .map(parseEtalonAction)
    .filter((action) => action.kind === CALL_ACTION)
    .map((action) => action.target);
}

function fromMainService(card: IncidentCard | null): string[] {
  const main = card?.expectedServices.find((service) => service.includes(MAIN_SERVICE_MARK));
  const match = main ? LEADING_NUMBER.exec(main) : null;
  return match ? [match[1]] : [];
}

export function resolveExpectedCall({
  cardId,
  card,
  scenarios,
  numbers,
}: ExpectedCallInput): ExpectedCall | null {
  const scenario = scenarios.find((candidate) => candidate.cardIds.includes(cardId));
  const sources: [ExpectedCallSource, string[]][] = [
    ["etalon", fromEtalon(scenario, cardId)],
    ["mainService", fromMainService(card)],
    ["callTarget", scenario?.callTarget ? [scenario.callTarget] : []],
  ];
  for (const [source, candidates] of sources) {
    const matched = inDirectory(candidates, numbers);
    if (matched.length > 0) return { cardId, numbers: matched, source };
  }
  return null;
}
