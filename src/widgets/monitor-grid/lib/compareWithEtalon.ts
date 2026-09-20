import type { EtalonActionDictionary } from "@/entities/session";
import { describeEtalonAction, getElapsedSec } from "@/entities/session";
import { formatDuration } from "@/shared/lib";

import type { ActionCheckRow, ActionDeviation, SnapshotAction } from "../model/types";

const MS_IN_SECOND = 1000;

type CompareOptions = {
  actions: SnapshotAction[];
  expected: string[];
  isCardFinished: boolean;
  dictionary: EtalonActionDictionary;
};

function getDeviation(action: string, expected: string[], lastMatchedIndex: number): ActionDeviation {
  const expectedIndex = expected.indexOf(action);
  if (expectedIndex < 0) return "extra";
  return expectedIndex < lastMatchedIndex ? "order" : "ok";
}

/**
 * Сверка действий курсанта с эталоном карточки (Etalon.expectedActions):
 * ok — по эталону; order — нарушен порядок; extra — лишнее; pending/missing — ещё не выполнено / пропущено.
 */
export function compareWithEtalon({ actions, expected, isCardFinished, dictionary }: CompareOptions) {
  const openedAt = actions[0]?.at;
  let lastMatchedIndex = -1;
  const performed: ActionCheckRow[] = actions.map((snapshotAction, index) => {
    const deviation = getDeviation(snapshotAction.action, expected, lastMatchedIndex);
    lastMatchedIndex = Math.max(lastMatchedIndex, expected.indexOf(snapshotAction.action));
    const offsetSec = openedAt ? getElapsedSec(openedAt, snapshotAction.at) : 0;
    return {
      id: `done-${index}`,
      action: snapshotAction.action,
      label: describeEtalonAction(snapshotAction.action, dictionary),
      offset: `+${formatDuration(offsetSec * MS_IN_SECOND)}`,
      deviation,
    };
  });
  const doneActions = new Set(actions.map((snapshotAction) => snapshotAction.action));
  const remaining: ActionCheckRow[] = expected
    .filter((action) => !doneActions.has(action))
    .map((action, index) => ({
      id: `left-${index}`,
      action,
      label: describeEtalonAction(action, dictionary),
      offset: null,
      deviation: isCardFinished ? "missing" : "pending",
    }));
  return [...performed, ...remaining];
}
