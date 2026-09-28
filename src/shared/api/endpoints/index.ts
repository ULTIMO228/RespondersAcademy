/* Доменные функции клиента мок-слоя (по контрактам T1.1-08…18). */
export { adminGetSettings, adminListAudit, adminListServices, adminToggleUserActive } from "./admin";
export { adminSystemApi, getAuditLog, getSystemLogs, getSystemMonitoring } from "./admin-system";
export { getSystemServices, getSystemSettings, getSystemUsageStats } from "./admin-system";
export { patchSystemSettings, postSystemServiceAction } from "./admin-system";
export type { AdminSystemApi } from "./admin-system";
export { ADMIN_USER_FAILURE_MESSAGES, adminCreateUser, adminListUsers } from "./admin-users";
export { adminResetUserPassword, adminSetUserActive, adminSetUserRole } from "./admin-users";
export { adminUpdateUser, mapAdminUserError } from "./admin-users";
export type { AdminUserFailure, AdminUserFailureReason } from "./admin-users";
export { postAttemptProgress, postCardAttempt } from "./attempts";
export { LOGIN_FAILURE_MESSAGES, getAuthPolicy, login, mapLoginError } from "./auth";
export { postCallReply, postCardCall } from "./calls";
export type { LoginFailure, LoginFailureReason } from "./auth";
export { getCard, getCardRecordings, getCards, getCardSms, postCardLinks } from "./cards";
export { postCardReminder, postCardSms, postCardStatus, postCardWorkline } from "./cards";
export { API_PATHS } from "./paths";
export { getClassifier, getReference } from "./reference";
export { getReportJournal, postAttemptEvaluation, postReportFeedback } from "./reports";
export {
  createScenario,
  createSession,
  getAssessmentReview,
  getAssessmentState,
  getAttemptEvaluation,
  getMyErrors,
  getReports,
  getSessionAiReport,
  getSessionControl,
  getSessionErrors,
  getSessionErrorSummary,
  getSessionFeed,
  getStudentReports,
  listScenarios,
  listSessions,
  postSessionControl,
  resolveAssessment,
  startSession,
  stopSession,
  validateScenario,
} from "./training";
export { listUsers } from "./users";
export { checkGrammar, deleteScenario, generateScenarios, getProfileMapping } from "./teacher";
export { getScenario, listMaterials, listTrainingCards, saveProfileMapping } from "./teacher";
export { updateScenario, uploadMaterial } from "./teacher";
export type { GrammarCheckBinding } from "./teacher";
export {
  approveAIScenario,
  createAIScenarioDrafts,
  listAIScenarioVersions,
  reviseAIScenario,
} from "./scenarios";
