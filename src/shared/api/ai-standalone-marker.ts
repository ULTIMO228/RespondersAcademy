/*
 * Пометка ответов автономного режима ИИ-панелей (app/api/v1/ai/**, фронт без BACKEND_URL). Ответы — детерминированная
 * имитация на синтетических моках, а не реальный ИИ-контур бэкенда; UI обязан показать это рядом с бейджем «ИИ»
 * (AGENTS §2, §10). Метка едет в штатных полях контракта (модель/версия оценщика/эталона) — контракт не меняется.
 */
export const STANDALONE_AI_RELEASE = "standalone-mock/1";
/** reasonCode состояния оценки в автономном режиме (у бэкенда поле занято только значением review_pending). */
export const STANDALONE_AI_REASON = "standalone_mock";
export const STANDALONE_AI_NOTE = "Автономный режим: ответ имитации ИИ, сервер тренажёра не подключён";

export function isStandaloneAiRelease(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("standalone-mock/");
}
