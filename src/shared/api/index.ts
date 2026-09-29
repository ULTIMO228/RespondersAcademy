/*
 * Public API сегмента shared/api: контрактные типы, клиент мок-слоя /api/mock/* и статика волны 0.
 * Серверная часть мок-слоя (ридеры, store, хелперы handlers) — только "@/shared/api/mock" из app/api/**.
 * Имена прототипа волны 0 (ArmCardFixture, CardEvent, NotificationEntry, NotificationStatus, Report,
 * Session, StatusRef, WorkLine) пока выведены из JSON; их контрактные версии — с суффиксом Contract.
 */
export { armCardFixtures, cards, classifier, groupReport, reference, reports, scenarios } from "./mocks";
export { sessions, users } from "./mocks";
export { STANDALONE_AI_NOTE, STANDALONE_AI_REASON, STANDALONE_AI_RELEASE } from "./ai-standalone-marker";
export { isStandaloneAiRelease } from "./ai-standalone-marker";
export { ApiError, SERVER_REQUIRED_MESSAGE, ServerRequiredError, setUnauthorizedHandler } from "./client";
export { apiClient, buildQuery, createApiClient } from "./client";
export type { ApiClient, ApiClientConfig, ApiRequestOptions } from "./client";
// ИИ-модуль: заменить на реальный сервис — вызывающий код зависит от AiGateway, MockAiGateway подменяется инъекцией.
export type { AiGateway, AiProvider, AiResponse } from "./ai-gateway";
export { createMockAiGateway, MockAiGateway } from "./ai-gateway.mock";
export type { MockAiGatewayDeps } from "./ai-gateway.mock";
export { createAssignment, finishAssignment, getAssignment, listAssignments } from "./endpoints";
export { downloadReportExport, getGroupInsights, getStudentProfile, listTickets } from "./endpoints";
export { getHealth, startAssignment, updateKbArticle } from "./endpoints";
export { acceptRecommendation, getAnalytics, getHistory, getKbArticle, getMe } from "./endpoints";
export { listKbArticles, listRecommendations } from "./endpoints";
export { EXAM_REPLAY_DENIED_MESSAGE, STREET_QUERY_MIN_LENGTH, answerAttempt } from "./endpoints";
export { fetchTicketAudioFile, getNotificationList, getOperatorEvaluation } from "./endpoints";
export {
  getTicketAudio,
  searchStreets,
  sendAttemptEvent,
  submitAttempt,
  ticketAudioFileUrl,
} from "./endpoints";
export type { SubmitAttemptResult } from "./endpoints";
export { listWorkMessages, postReportAudio } from "./endpoints";
export { API_PATHS, adminGetSettings, adminListAudit, adminListServices, adminListUsers } from "./endpoints";
export { adminToggleUserActive, createScenario, createSession, getAttemptEvaluation } from "./endpoints";
export {
  getAssessmentReview,
  getAssessmentState,
  getMyErrors,
  getSessionAiReport,
  getSessionErrors,
  getSessionErrorSummary,
  resolveAssessment,
} from "./endpoints";
export { adminSystemApi, getAuditLog, getSystemLogs, getSystemMonitoring } from "./endpoints";
export { getSystemServices, getSystemSettings, getSystemUsageStats } from "./endpoints";
export { patchSystemSettings, postSystemServiceAction } from "./endpoints";
export type { AdminSystemApi } from "./endpoints";
export { getCard, getCardRecordings, getCardSms, getCards, getClassifier, getReference } from "./endpoints";
export { getReports, getSessionFeed, listScenarios, listSessions, login, postCardLinks } from "./endpoints";
export { postCardReminder, postCardSms, postCardStatus, postCardWorkline, startSession } from "./endpoints";
export { getStudentReports, stopSession, validateScenario } from "./endpoints";
export { getSessionControl, listUsers, postSessionControl } from "./endpoints";
export { getReportJournal, postAttemptEvaluation, postReportFeedback } from "./endpoints";
export { postCallReply, postCardCall } from "./endpoints";
export { postAttemptProgress, postCardAttempt } from "./endpoints";
export { LOGIN_FAILURE_MESSAGES, changePassword, getAuthPolicy, getSession, logout } from "./endpoints";
export { logoutAll, mapLoginError } from "./endpoints";
export { checkGrammar, deleteScenario, generateScenarios, getProfileMapping } from "./endpoints";
export { getScenario, listMaterials, listTrainingCards, saveProfileMapping } from "./endpoints";
export { updateScenario, uploadMaterial } from "./endpoints";
export type { GrammarCheckBinding } from "./endpoints";
export {
  approveAIScenario,
  createAIScenarioDrafts,
  listAIScenarioVersions,
  reviseAIScenario,
} from "./endpoints";
export { ADMIN_USER_FAILURE_MESSAGES, adminCreateUser, adminResetUserPassword } from "./endpoints";
export { adminSetUserActive, adminSetUserRole, adminUpdateUser, mapAdminUserError } from "./endpoints";
export type { AdminUserFailure, AdminUserFailureReason } from "./endpoints";
export type { LoginFailure, LoginFailureReason, LoginResult } from "./endpoints";
export type { ArmCardFixture, CardEvent, NotificationEntry, NotificationStatus } from "./prototype-types";
export type { Report, Session, StatusRef, WorkLine } from "./prototype-types";
export type { ApiErrorBody, ApiErrorCode, ArmCardAddress, ArmCardApplicant } from "./types";
export type { ArmCardCasualties, ArmCardFixture as ArmCardFixtureContract, ArmCardId } from "./types";
export type { ArmCardPhones, ArmCardWhat, AuditLogEntry, AuthPolicy, AuthSession } from "./types";
export type { CallerStatus } from "./types";
export type { CardDetails, CardEvent as CardEventContract, CardFlowItem, CardId, CardLink } from "./types";
export type { CardLinkRole, CardLinksResponse, CardRecording, CardReminder } from "./types";
export type { CardReminderRequest, CardRuntimeState, CardSms, CardSmsRequest, CardSource } from "./types";
export type { CardStatus, CardStatusDef, CardStatusEvent, CardStatusMark, CardStatusRef } from "./types";
export type { CardStatusRequest, CardWorkLine, CardWorkLineRequest, CardsQuery, ChartData } from "./types";
export type { ChartKind, ClassifierEntry, ClassifierMeta, ClassifierNotification } from "./types";
export type { ClassifierQuery, ClassifierRowsRef, DdsStatus, DdsStatusDef, Difficulty } from "./types";
export type { District, ErrorSeverity, Etalon, Evaluation, EvaluationError, GeoPoint } from "./types";
export type { GrammarError, GrammarErrorType, GroupReport, GroupReportCharts, IncidentCaller } from "./types";
export type { IncidentCard, IncidentCardId, IncidentVictims, InternalNumber, LabeledSeries } from "./types";
export type { ChangePasswordRequest, LoginRequest, NotificationAddedBy } from "./types";
export type { NotificationEntry as NotificationEntryContract, NotificationMode, PageQuery } from "./types";
export type { PageResponse, PhoneCall, PublicUser, QueryParams, QueryScalar, QueryValue } from "./types";
export type { ReferenceData, Report as ReportContract, ReportCharts, ReportError } from "./types";
export type { ReportExportFormat, ReportGrammarError, ReportStageAttempt, ReportStudent } from "./types";
export type { EvaluationOverrideRequest, ReportFeedback, ReportFeedbackRequest } from "./types";
export type { ReportJournalFilters, ReportJournalQuery, ReportJournalResponse } from "./types";
export type { ReportJournalRow, ReportJournalStatus, ReportJournalStudent } from "./types";
export type { ReportTimeMetric, ReportsResponse, Role, Scenario, ScenarioCreateRequest } from "./types";
export type { ScenarioHints, ScenarioLevel, ScenarioListQuery, ScenarioMode, ScenarioSource } from "./types";
export type { ScenarioTimeNorms, ScenarioValidateAction, ScenarioValidateRequest } from "./types";
export type { ScenarioValidation, ScenarioValidationStatus, ServiceKind, ServiceNotification } from "./types";
export type {
  AIExpectedAction,
  AIFieldDecision,
  AIFieldDecisionInput,
  AIFieldDecisionKind,
  AIScenarioApproveRequest,
  AIScenarioDraftRequest,
  AIScenarioReviseRequest,
  AIScenarioVersion,
  AIValidationError,
  AIWorkflowApproval,
  AIWorkflowMode,
  AIWorkflowSourceKind,
  AIWorkflowValidation,
} from "./types";
export type {
  AssessmentAxes,
  AssessmentResolveRequest,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  EvaluationStatus,
  SemanticArbitrationDecision,
  SemanticReviewItem,
} from "./types";
export type {
  ErrorRecord,
  ErrorRecordCategory,
  ErrorRecordDetector,
  PaginatedErrorRecordsResponse,
  SessionAiReport,
  SessionErrorSummaryResponse,
  StudentAttemptErrorsItem,
  StudentErrorsResponse,
  TopMistakeItem,
} from "./types";
export type { GrammarCheckRequest, MaterialFormat, MaterialUploadRequest } from "./types";
export type { ProfileMappingRow, ProfileMappingSaveRequest, ScenarioGenerateRequest } from "./types";
export type { ScenarioUpdateRequest, TrainingMaterial } from "./types";
export type { ServiceRef, ServiceStatus, ServiceStatusDef, ServiceStatusEvent } from "./types";
export type { Session as SessionContract, SessionCreateRequest, SessionFeedEvent } from "./types";
export type { SessionFeedEventKind, SessionFeedQuery, SessionFeedResponse, SessionListQuery } from "./types";
export type { SessionControlAction, SessionControlRequest, SessionControlResponse } from "./types";
export type { SessionIssueOrder, SessionPlan, UserListQuery } from "./types";
export type { SessionState, SmsDirection, SuccessCriteria, SystemService, SystemServiceState } from "./types";
export type { SystemSettings, TeacherOverride, ToggleUserActiveRequest, TrainingCard } from "./types";
export type { AuditEventType, AuditLogQuery, SystemIntegrity, SystemLogEntry } from "./types";
export type { SystemLogLevel, SystemLogsQuery, SystemMonitoring, SystemServiceAction } from "./types";
export type { SystemServiceActionRequest, SystemServicesResponse, SystemSettingsPatch } from "./types";
export type { UsageStats, UsageStatsPeriod, UsageStatsPeriodId, UsageStatsQuery } from "./types";
export { SETTINGS_LIMITS, SETTINGS_MESSAGES, SETTINGS_NORMS } from "./validation/settings";
export { validateSettings, validateSettingsPatch } from "./validation/settings";
export type { SettingsFieldError } from "./validation/settings";
export type { TranscriptLine, TranscriptSpeaker, User, UserRole } from "./types";
export type { CardSearchFilters, WorkLine as WorkLineContract } from "./types";
export type { CallReply, CallReplyRequest, CallTurn, CallVoice, CardCallRequest } from "./types";
export type { CardCallResponse } from "./types";
export type { AttemptProgressRequest, CardAttemptRequest, CardAttemptResponse } from "./types";
export type { AdminUserActionRequest, AdminUserCreateRequest, AdminUserListQuery } from "./types";
export type { AdminUserPasswordResetResponse, AdminUserRoleFields, AdminUserState } from "./types";
export type { AdminUserUpdateRequest } from "./types";
export type {
  Analytics,
  AnalyticsDynamics,
  AnalyticsTopError,
  Assignment,
  AssignmentCreateRequest,
  AssignmentDetail,
  AssignmentFormat,
  AssignmentHints,
  AssignmentLinkState,
  AssignmentListQuery,
  AssignmentNorms,
  AssignmentParams,
  AssignmentProgress,
  AssignmentRandomRule,
  AssignmentScenarioVersion,
  AssignmentState,
  ChainReview,
  ChainSubmitReview,
  HistoryItem,
  HistoryQuery,
  GroupInsight,
  HealthStatus,
  GroupInsights,
  KbArticle,
  KbArticlePatch,
  KbArticlesQuery,
  KbSections,
  LobbyMode,
  Recommendation,
  RecommendationKind,
  RecommendationReason,
  ReportAudioResponse,
  ReportCall,
  ReportCheck,
  ReportCheckResult,
  ReportTranscriptLine,
  StartAssignmentResult,
  StudentProfile,
  Stats,
  Ticket,
  TicketOrigin,
  TicketsQuery,
  TypicalError,
  WorkMessage,
  WorkMessageKind,
  WorkMessageStatus,
  TrainingMode,
} from "./types";
export type {
  AddressSource,
  CardDraft,
  CardDraftAddress,
  CardDraftApplicant,
  CardDraftCasualties,
  CardDraftEmergency,
  CardDraftNotification,
  CardDraftPhones,
  CardDraftWhat,
  FieldDiff,
  NotificationAdder,
  NotificationListItem,
  NotificationListPreview,
  NotificationListResponse,
  OperatorAttempt,
  OperatorAttemptState,
  OperatorEvaluation,
  OperatorEvent,
  OperatorEventKind,
  OperatorEventRequest,
  OperatorEventType,
  OperatorHintStep,
  OperatorHints,
  Street,
  TicketAudio,
  TicketAudioStatus,
} from "./types";
