/*
 * Route handlers конструктора сценариев: материалы, привязка профильных категорий, учебные карточки
 * и принудительная проверка грамматики (логика — ../teacher.ts, ИИ — через AiGateway).
 */
import type { AiGateway } from "../../ai-gateway";
import { readJsonBody } from "../request";
import { jsonCreated, jsonOk, validationFailed, withErrorHandling } from "../respond";
import { listMaterials, listProfileMapping, listTrainingCards } from "../teacher";
import { saveProfileMapping, uploadMaterial } from "../teacher";

export const handleGetMaterials = withErrorHandling(() => jsonOk(listMaterials()));

export const handlePostMaterial = withErrorHandling(async (request: Request) =>
  jsonCreated(await uploadMaterial(request)),
);

export const handleGetProfileMapping = withErrorHandling(() => jsonOk(listProfileMapping()));

export const handlePutProfileMapping = withErrorHandling(async (request: Request) =>
  jsonOk(await saveProfileMapping(request)),
);

export const handleGetTrainingCards = withErrorHandling(() => jsonOk(listTrainingCards()));

/**
 * POST /grammar-check — проверка текста после ручных правок (сценарий А шаг 9). Ответ — AiResponse
 * с маркером происхождения: UI обязан показать бейдж «ИИ» (ИИ-модуль: заменить на реальный сервис).
 */
export function createPostGrammarCheckHandler(getGateway: () => AiGateway) {
  return withErrorHandling(async (request: Request) => {
    const body = await readJsonBody(request);
    if (typeof body.text !== "string") throw validationFailed("Передайте текст для проверки грамматики");
    const field = typeof body.field === "string" && body.field.trim() ? body.field.trim() : undefined;
    return jsonOk(await getGateway().checkGrammar(body.text, field));
  });
}
