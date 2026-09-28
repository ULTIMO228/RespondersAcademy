/*
 * Клиент конструктора сценариев преподавателя (фаза 3.1): правка/удаление/генерация сценариев,
 * учебные карточки, материалы-заглушки, привязка профильных категорий, проверка грамматики.
 * Компоненты не знают про fetch и URL — только эти функции.
 */
import type { AiResponse } from "../ai-gateway";
import { apiClient } from "../client";
import type {
  GrammarCheckRequest,
  GrammarError,
  IncidentCard,
  MaterialUploadRequest,
  ProfileMappingRow,
  ProfileMappingSaveRequest,
  Scenario,
  ScenarioGenerateRequest,
  ScenarioUpdateRequest,
  TrainingMaterial,
} from "../types";
import { API_PATHS } from "./paths";

/** GET /scenarios/[id] — сценарий с мутациями мок-слоя (404 notFound — неизвестный id). */
export function getScenario(scenarioId: string, signal?: AbortSignal): Promise<Scenario> {
  return apiClient.get<Scenario>(API_PATHS.scenario(scenarioId), undefined, signal);
}

/** PATCH /scenarios/[id] — параметры, эталон, критерии успешности (только переданные поля). */
export function updateScenario(scenarioId: string, body: ScenarioUpdateRequest): Promise<Scenario> {
  return apiClient.patch<Scenario>(API_PATHS.scenario(scenarioId), body);
}

/** DELETE /scenarios/[id]?deletedBy= — удаление неактуального сценария (409 — системный/в занятии). */
export function deleteScenario(scenarioId: string, deletedBy: string): Promise<Scenario> {
  return apiClient.remove<Scenario>(API_PATHS.scenario(scenarioId), { deletedBy });
}

/** POST /scenarios/generate — 2–3 мок-вариации по группе ЕКП со статусом «на проверке». */
export function generateScenarios(body: ScenarioGenerateRequest): Promise<Scenario[]> {
  return apiClient.post<Scenario[]>(API_PATHS.scenarioGenerate, body);
}

/** GET /training-cards — 96 учебных карточек (билет.ситуация) с группой ЕКП и эталонными тегами. */
export function listTrainingCards(signal?: AbortSignal): Promise<IncidentCard[]> {
  return apiClient.get<IncidentCard[]>(API_PATHS.trainingCards, undefined, signal);
}

export function listMaterials(signal?: AbortSignal): Promise<TrainingMaterial[]> {
  return apiClient.get<TrainingMaterial[]>(API_PATHS.materials, undefined, signal);
}

/** POST /materials — файл-заглушка DOCX/PDF/MP3 (содержимое не передаётся и не обрабатывается). */
export function uploadMaterial(body: MaterialUploadRequest): Promise<TrainingMaterial> {
  return apiClient.post<TrainingMaterial>(API_PATHS.materials, body);
}

export function getProfileMapping(signal?: AbortSignal): Promise<ProfileMappingRow[]> {
  return apiClient.get<ProfileMappingRow[]>(API_PATHS.profileMapping, undefined, signal);
}

/** PUT /profile-mapping — «Сохранить привязку» (действие пишется в журнал аудита). */
export function saveProfileMapping(body: ProfileMappingSaveRequest): Promise<ProfileMappingRow[]> {
  return apiClient.put<ProfileMappingRow[]>(API_PATHS.profileMapping, body);
}

/** Привязка проверки текста к сценарию и его версии (US3). */
export type GrammarCheckBinding = Pick<GrammarCheckRequest, "scenarioId" | "scenarioVersion">;

/** POST /grammar-check — «Проверить грамматику»: ответ несёт маркер ИИ (UI показывает бейдж «ИИ»). */
export function checkGrammar(
  text: string,
  field?: string,
  binding?: GrammarCheckBinding,
): Promise<AiResponse<GrammarError[]>> {
  const body: GrammarCheckRequest = { text, field, ...binding };
  return apiClient.post<AiResponse<GrammarError[]>>(API_PATHS.grammarCheck, body);
}
