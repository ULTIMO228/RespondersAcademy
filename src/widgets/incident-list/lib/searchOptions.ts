import type { ArmCardFixtureContract, ReferenceData } from "@/shared/api";

import type { AdvancedSearchOptions, SignTreeNode } from "../model/types";

/*
 * Значения полей расширенного поиска: справочники GET /api/mock/reference; АРМ и дерево признаков — из рабочих
 * карточек (GET /api/mock/cards?dataset=fixtures): именно по ним ищет мок-слой (номер АРМ из «Опер. N, АРМ M»,
 * признаки what.signs 1–3-го уровня). Полный ЕКП (1283 строки classifier.json) на клиент не загружается.
 */

const ARM_PATTERN = /АРМ\s*(\d+)/;
const ARM_NUMBER_WIDTH = 3;
const SIGN_LEVELS = 3;

function collectArms(fixtures: readonly ArmCardFixtureContract[]): AdvancedSearchOptions["arms"] {
  const numbers = fixtures.flatMap((card) => ARM_PATTERN.exec(card.registeredBy)?.[1] ?? []);
  return [...new Set(numbers)]
    .sort((left, right) => Number(left) - Number(right))
    .map((armNumber) => ({ value: armNumber, label: `АРМ ${armNumber.padStart(ARM_NUMBER_WIDTH, "0")}` }));
}

function insertPath(nodes: SignTreeNode[], path: readonly string[]): void {
  const [head, ...rest] = path;
  if (!head) return;
  let node = nodes.find((candidate) => candidate.label === head);
  if (!node) {
    node = { label: head, children: [] };
    nodes.push(node);
  }
  insertPath(node.children, rest);
}

/** Дерево «признак 1 → признак 2 → признак 3» (как в опросной карте) из what.signs карточек. */
export function buildSignTree(fixtures: readonly ArmCardFixtureContract[]): SignTreeNode[] {
  const tree: SignTreeNode[] = [];
  fixtures.forEach((card) => insertPath(tree, card.what.signs.slice(0, SIGN_LEVELS)));
  return tree;
}

export function buildSearchOptions(
  reference: ReferenceData,
  fixtures: readonly ArmCardFixtureContract[],
): AdvancedSearchOptions {
  return {
    arms: collectArms(fixtures),
    services: reference.services.map((service) => ({ value: service.id, label: service.shortName })),
    channels: reference.channels.map((channel) => ({ value: channel, label: channel })),
    sources: reference.sources.map((source) => ({ value: source, label: source })),
    cardStatuses: reference.cardStatuses.map((status) => ({ value: status.status, label: status.title })),
    districts: reference.districts,
    signTree: buildSignTree(fixtures),
  };
}
