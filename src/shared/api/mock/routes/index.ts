/*
 * Route handlers мок-слоя для корневого app/api/mock/**. Имя: handle<Метод><Ресурс>.
 * route.ts — одна строка: `export { handleGetReference as GET } from "@/shared/api/mock/routes";`
 */
export { handleGetAdminServices, handleGetAdminSettings } from "./admin";
export { handleGetAdminUsers, handlePatchAdminUser, handlePostAdminToggleActive } from "./admin-users";
export { handlePostAdminUser, handlePostAdminUserBlock, handlePostAdminUserUnblock } from "./admin-users";
export { handlePostAdminUserResetPassword } from "./admin-users";
export { handlePostAttemptProgress, handlePostCardAttempt } from "./attempts";
export { handleGetAuthPolicy, handlePostLogin } from "./auth";
export { handlePostCallReply, handlePostCardCall } from "./calls";
export { handleGetCardRecordings, handleGetCardSms, handlePostCardLinks } from "./card-actions";
export { createPostCardStatusHandler, handlePostCardReminder, handlePostCardSms } from "./card-actions";
export { handlePostCardWorkLine } from "./card-actions";
export { createGetCardsHandler, handleGetCard } from "./cards";
export { handleGetClassifier } from "./classifier";
export { handleGetReference } from "./reference";
export { createGetAttemptEvaluationHandler, createGetReportsHandler } from "./reports";
export { createGetReportJournalHandler, createPostAttemptEvaluationHandler } from "./reports";
export { createPostReportFeedbackHandler } from "./reports";
export { createPostScenarioGenerateHandler, handleDeleteScenario, handleGetScenario } from "./scenarios";
export { handleGetScenarios, handlePatchScenario, handlePostScenario } from "./scenarios";
export { handlePostScenarioValidate } from "./scenarios";
export { createPostGrammarCheckHandler, handleGetMaterials, handleGetProfileMapping } from "./teacher";
export { handleGetTrainingCards, handlePostMaterial, handlePutProfileMapping } from "./teacher";
export { createGetSessionFeedHandler, createGetSessionsHandler, handlePostSession } from "./sessions";
export { createPostSessionControlHandler, handleGetSessionControl } from "./sessions";
export { handlePostSessionControl } from "./sessions";
export { handlePostSessionStart, handlePostSessionStop } from "./sessions";
export { createGetUsersHandler } from "./users";
export { handleGetAuditLog, handleGetSystemLogs, handleGetSystemMonitoring } from "./system";
export { handleGetSystemServices, handleGetSystemSettings, handleGetSystemUsageStats } from "./system";
export { handlePatchSystemSettings, handlePostSystemServiceAction } from "./system";
