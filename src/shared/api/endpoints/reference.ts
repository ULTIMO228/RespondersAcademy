import { apiClient } from "../client";
import type { ClassifierEntry, ClassifierQuery, ReferenceData } from "../types";
import { API_PATHS } from "./paths";

/** GET /reference → справочники (11 коллекций; classifierRows — ссылка). */
export function getReference(signal?: AbortSignal): Promise<ReferenceData> {
  return apiClient.get<ReferenceData>(API_PATHS.reference, undefined, signal);
}

/** GET /classifier?group= → записи ЕКП (без group — все). */
export function getClassifier(query?: ClassifierQuery, signal?: AbortSignal): Promise<ClassifierEntry[]> {
  return apiClient.get<ClassifierEntry[]>(API_PATHS.classifier, query, signal);
}
