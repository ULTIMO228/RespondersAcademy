/*
 * GET /api/mock/classifier?group= (T1.1-09) → ClassifierEntry[] ЕКП; ?code= — записи группы кода (T2.3-08).
 * group — точное совпадение с ClassifierEntry.group (после trim; кириллица декодируется URLSearchParams);
 * несуществующая группа → []; без group — все записи (1283).
 * РЕШЕНИЕ по meta: тело — массив по контракту клиента; версия классификатора (meta.version, напр. v046.24)
 * отдаётся заголовком CLASSIFIER_VERSION_HEADER (encodeURIComponent — в значении есть кириллица),
 * полное meta доступно серверу через readClassifierMeta(), объём — reference.classifierRows.rowCount.
 */
import type { ClassifierEntry } from "../types";
import { readClassifier, readClassifierMeta } from "./readers";
import { readStringParam } from "./request";

export const CLASSIFIER_VERSION_HEADER = "X-Classifier-Version";

/** Группа записи ЕКП по коду (?code=): неизвестный код — пустая выдача. */
function resolveGroup(params: URLSearchParams): string | undefined {
  const code = readStringParam(params, "code");
  if (code === undefined) return readStringParam(params, "group");
  return readClassifier().find((entry) => entry.code === code)?.group ?? "";
}

export function listClassifierEntries(params: URLSearchParams): ClassifierEntry[] {
  const group = resolveGroup(params);
  if (group === "") return [];
  const entries = group ? readClassifier().filter((entry) => entry.group === group) : readClassifier();
  return structuredClone([...entries]);
}

export function classifierVersionHeader(): Record<string, string> {
  return { [CLASSIFIER_VERSION_HEADER]: encodeURIComponent(readClassifierMeta().version) };
}
