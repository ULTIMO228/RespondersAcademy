/*
 * Действия эталона (Scenario.etalon.expectedActions): «openCard:c-095», «status:accepted», «call:103»,
 * «transfer:region». Разбор и русские подписи — общие для монитора, редактора и отчётов.
 */
const OPEN_CARD = "openCard";
const STATUS = "status";
const CALL = "call";
const TRANSFER = "transfer";

export type EtalonActionDictionary = {
  /** status → «Принята» (reference.ddsStatuses). */
  statusTitles: Record<string, string>;
  /** внутренний номер → название (reference.internalNumbers). */
  numberTitles?: Record<string, string>;
  /** id учебной карточки → подпись («36814850» / «c-094»). */
  cardLabels?: Record<string, string>;
};

export function parseEtalonAction(action: string): { kind: string; target: string } {
  const separatorIndex = action.indexOf(":");
  if (separatorIndex < 0) return { kind: action, target: "" };
  return { kind: action.slice(0, separatorIndex), target: action.slice(separatorIndex + 1) };
}

/** Русская подпись действия: «Статус «Принята»», «Звонок точке C: 103 (Служба 103)». */
export function describeEtalonAction(action: string, dictionary: EtalonActionDictionary): string {
  const { kind, target } = parseEtalonAction(action);
  if (kind === OPEN_CARD) return `Открытие карточки ${dictionary.cardLabels?.[target] ?? target}`;
  if (kind === STATUS) return `Статус «${dictionary.statusTitles[target] ?? target}»`;
  if (kind === CALL) {
    const title = dictionary.numberTitles?.[target];
    return title ? `Звонок точке C: ${target} (${title})` : `Звонок точке C: ${target}`;
  }
  if (kind === TRANSFER) return "Перевод вызова в ЦУС другого региона";
  return action;
}

/** Часть эталона, относящаяся к одной карточке очереди: от «openCard:<id>» до следующего openCard. */
export function getCardEtalonSegment(expectedActions: string[], cardId: string): string[] {
  const startIndex = expectedActions.indexOf(`${OPEN_CARD}:${cardId}`);
  if (startIndex < 0) return [];
  const rest = expectedActions.slice(startIndex + 1);
  const nextOpenIndex = rest.findIndex((action) => action.startsWith(`${OPEN_CARD}:`));
  const segment = nextOpenIndex < 0 ? rest : rest.slice(0, nextOpenIndex);
  return [expectedActions[startIndex], ...segment];
}
