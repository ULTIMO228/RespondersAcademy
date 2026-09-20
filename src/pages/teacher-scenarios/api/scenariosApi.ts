/*
 * Клиент данных `/teacher/scenarios` (T3.1-02…T3.1-09): список сценариев с фильтрами, справочники,
 * материалы-заглушки и привязка профильных категорий — всё через мок-слой `@/shared/api`.
 * Зависимости выносятся в тип, чтобы экран тестировался без сети (RTL вместо e2e).
 */
import {
  checkGrammar,
  createScenario,
  deleteScenario,
  generateScenarios,
  getProfileMapping,
  getReference,
  listMaterials,
  listScenarios,
  saveProfileMapping,
  uploadMaterial,
} from "@/shared/api";
import type {
  GrammarError,
  MaterialUploadRequest,
  ProfileMappingRow,
  ProfileMappingSaveRequest,
  ReferenceData,
  Scenario,
  ScenarioCreateRequest,
  ScenarioGenerateRequest,
  ScenarioListQuery,
  TrainingMaterial,
} from "@/shared/api";

export type ScenariosApi = {
  listScenarios: (query?: ScenarioListQuery, signal?: AbortSignal) => Promise<Scenario[]>;
  getReference: (signal?: AbortSignal) => Promise<ReferenceData>;
  listMaterials: (signal?: AbortSignal) => Promise<TrainingMaterial[]>;
  getProfileMapping: (signal?: AbortSignal) => Promise<ProfileMappingRow[]>;
  createScenario: (body: ScenarioCreateRequest) => Promise<Scenario>;
  generateScenarios: (body: ScenarioGenerateRequest) => Promise<Scenario[]>;
  deleteScenario: (scenarioId: string, deletedBy: string) => Promise<Scenario>;
  uploadMaterial: (body: MaterialUploadRequest) => Promise<TrainingMaterial>;
  saveProfileMapping: (body: ProfileMappingSaveRequest) => Promise<ProfileMappingRow[]>;
  checkGrammar: (text: string, field?: string) => Promise<{ data: GrammarError[] }>;
};

export const defaultScenariosApi: ScenariosApi = {
  listScenarios,
  getReference,
  listMaterials,
  getProfileMapping,
  createScenario,
  generateScenarios,
  deleteScenario,
  uploadMaterial,
  saveProfileMapping,
  checkGrammar,
};

export type ScenariosPageData = {
  scenarios: Scenario[];
  /** Число сценариев в мок-слое без фильтров — знаменатель заголовка списка. */
  totalCount: number;
  reference: ReferenceData;
  materials: TrainingMaterial[];
  profileMapping: ProfileMappingRow[];
};

/** Полная загрузка страницы: список по фильтрам + общий список, справочник, материалы, привязка. */
export async function loadScenariosPage(
  api: ScenariosApi,
  query: ScenarioListQuery,
  signal?: AbortSignal,
): Promise<ScenariosPageData> {
  const [scenarios, all, reference, materials, profileMapping] = await Promise.all([
    api.listScenarios(query, signal),
    api.listScenarios(undefined, signal),
    api.getReference(signal),
    api.listMaterials(signal),
    api.getProfileMapping(signal),
  ]);
  return { scenarios, totalCount: all.length, reference, materials, profileMapping };
}
