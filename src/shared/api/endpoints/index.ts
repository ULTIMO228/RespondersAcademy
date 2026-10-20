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
export { postAttemptChat } from "./ai-chat";
export { LOGIN_FAILURE_MESSAGES, changePassword, getAuthPolicy, getSession, login, logout } from "./auth";
export { logoutAll, mapLoginError } from "./auth";
export { postCallReply, postCardCall } from "./calls";
export type { LoginFailure, LoginFailureReason, LoginResult } from "./auth";
export { getCard, getCardRecordings, getCards, getCardSms, postCardLinks } from "./cards";
export { postCardReminder, postCardSms, postCardStatus, postCardWorkline } from "./cards";
export { API_PATHS } from "./paths";
export { getClassifier, getReference } from "./reference";
export { downloadReportExport, getReportJournal, postAttemptEvaluation, postReportFeedback } from "./reports";
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
export {
  createAssignment,
  finishAssignment,
  getAssignment,
  listAssignments,
  startAssignment,
  toStartResult,
} from "./assignments";
export { acceptRecommendation, getAnalytics, getGroupInsights, getHistory, getMe } from "./lobby";
export { getStudentProfile, listRecommendations } from "./lobby";
export { getKbArticle, getReferenceAccess, listKbArticles, updateKbArticle } from "./kb";
export { listTickets } from "./tickets";
export { listStudentCards } from "./student-cards";
export { updateStudentSpecializations } from "./teacher-students";
export {
  EXAM_REPLAY_DENIED_MESSAGE,
  STREET_QUERY_MIN_LENGTH,
  answerAttempt,
  fetchTicketAudioFile,
} from "./operator112";
export {
  getNotificationList,
  getPracticeNotificationList,
  getOperatorEvaluation,
  getTicketAudio,
  journal,
  matches,
  searchStreets,
} from "./operator112";
export { sendAttemptEvent, submitAttempt, ticketAudioFileUrl } from "./operator112";
export type { SubmitAttemptResult } from "./operator112";
export { listWorkMessages, postReportAudio } from "./work-messages";
export { getHealth } from "./health";
export {
  errorMapPdfUrl,
  errorMapXlsxUrl,
  getErrorMapGroup,
  getErrorMapJournal,
  getErrorMapSettings,
  getErrorMapStage,
  getErrorMapStudent,
  getErrorMapStudentStage,
  getMyFocus,
  listErrorMapGroups,
  saveErrorMapSettings,
  saveErrorMapVerdict,
} from "./error-map";
export type { ErrorMapPdfParams, ErrorMapQuery } from "./error-map";
export { getStudentRating, getStudentStats } from "./student-rating";
export type { StudentRatingQuery, StudentStatsQuery } from "./student-rating";
export {
  buildProblemReportForm,
  createProblemReport,
  listTeacherProblemReports,
  markProblemReportRead,
  problemReportAttachmentUrl,
} from "./problem-reports";
export type { ProblemReportDraft } from "./problem-reports";
export { getPerformanceReport, performancePdfUrl, performanceXlsxUrl } from "./performance";
export type { PerformanceQuery } from "./performance";
export {
  createGraphScenario,
  deriveGraphScenarioVersion,
  finishScenarioRun,
  getGraphScenarioVersion,
  getScenarioRun,
  listAssignedScenarios,
  listScenarioRuns,
  performScenarioAction,
  startScenarioRun,
  getScenarioPermissions,
  listGraphScenarios,
  listGraphScenarioVersions,
  listScenarioSources,
  publishGraphScenario,
  reviewGraphScenario,
  reviseGraphScenario,
  submitGraphScenario,
  validateScenarioGraph,
} from "./scenario-graph";
