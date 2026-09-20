import type { ClassifierEntry } from "@/shared/api";

import type { ClassifierTreeGroup } from "../model/types";

/** Минимум, нужный для сопоставления с матрицей ЕКП: IncidentCard и TrainingCardView оба подходят. */
export type ClassifiableCard = {
  group: string;
  expectedTags: readonly string[];
};

const TREE_NODE_LIMIT = 12;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function getSigns(entry: ClassifierEntry): string[] {
  return [entry.sign1, entry.sign2, entry.sign3].filter((sign) => sign.trim().length > 0);
}

function scoreEntry(entry: ClassifierEntry, tags: readonly string[]): number {
  const normalizedTags = tags.map(normalize);
  return getSigns(entry).filter((sign) => normalizedTags.includes(normalize(sign))).length;
}

/** Записи ЕКП, лучше всего совпадающие с эталонными тегами карточки (112-Признак.1/2/3). */
export function matchClassifierEntries(
  card: ClassifiableCard,
  classifier: readonly ClassifierEntry[],
): ClassifierEntry[] {
  const groupEntries = classifier.filter((entry) => entry.group === card.group);
  const scored = groupEntries.map((entry) => ({ entry, score: scoreEntry(entry, card.expectedTags) }));
  const bestScore = Math.max(0, ...scored.map((item) => item.score));
  if (bestScore === 0) return groupEntries.slice(0, 1);
  return scored.filter((item) => item.score === bestScore).map((item) => item.entry);
}

/** Дерево ЕКП для редактора: группа → записи «признак › признак › признак → итоговый тип». */
export function buildClassifierTree(
  cards: readonly ClassifiableCard[],
  classifier: readonly ClassifierEntry[],
): ClassifierTreeGroup[] {
  const selectedCodes = new Set(
    cards.flatMap((card) => matchClassifierEntries(card, classifier)).map((e) => e.code),
  );
  const groups = Array.from(new Set(cards.map((card) => card.group)));
  return groups.map((group) => {
    const entries = classifier.filter((entry) => entry.group === group);
    const selected = entries.filter((entry) => selectedCodes.has(entry.code));
    const others = entries.filter((entry) => !selectedCodes.has(entry.code));
    return {
      group,
      totalCount: entries.length,
      nodes: [...selected, ...others].slice(0, TREE_NODE_LIMIT).map((entry) => ({
        code: entry.code,
        path: getSigns(entry).join(" › "),
        finalType: entry.finalType,
        isSelected: selectedCodes.has(entry.code),
      })),
    };
  });
}
