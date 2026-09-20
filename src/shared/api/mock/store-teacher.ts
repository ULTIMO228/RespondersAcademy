/*
 * Store конструктора сценариев: учебные материалы-заглушки (T3.1-07) и таблица профильных
 * категорий (T3.1-09). Отдаёт копии; правила валидации — в логике эндпоинтов (teacher.ts).
 */
import type { ProfileMappingRow, TrainingMaterial } from "../types";
import { cloneOut, getMockState } from "./store";

/** Материалы, новые — первыми (список «Загрузка материалов»). */
export function listStoredMaterials(): TrainingMaterial[] {
  return cloneOut(getMockState().materials);
}

export function insertStoredMaterial(material: TrainingMaterial): TrainingMaterial {
  getMockState().materials.unshift(cloneOut(material));
  return cloneOut(material);
}

export function listStoredProfileMapping(): ProfileMappingRow[] {
  return cloneOut(getMockState().profileMapping);
}

/** Замена профильных групп у известных строк; неизвестные id вызывающий отсеивает заранее. */
export function saveStoredProfileMapping(
  rows: readonly { id: string; incidentGroups: string[] }[],
): ProfileMappingRow[] {
  const state = getMockState();
  for (const row of rows) {
    const draft = state.profileMapping.find((candidate) => candidate.id === row.id);
    if (draft) draft.incidentGroups = [...row.incidentGroups];
  }
  return cloneOut(state.profileMapping);
}
