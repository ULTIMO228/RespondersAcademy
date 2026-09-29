/* Public API контрактных типов мок-слоя (spec/000-фронт/05-data-models.md + транспорт /api/mock/*). */
export type { AuthPolicy, AuthSession, PublicUser, Role, User } from "./user";
export type { CallerStatus, CardStatus, CardStatusDef, ClassifierRowsRef, DdsStatus } from "./reference";
export type { DdsStatusDef, District, InternalNumber, ReferenceData, ServiceKind } from "./reference";
export type { ServiceRef, ServiceStatus, ServiceStatusDef } from "./reference";
export type { ClassifierEntry, ClassifierMeta, NotificationMode, ServiceNotification } from "./classifier";
export type { IncidentCaller, IncidentCard, IncidentCardId, IncidentVictims } from "./incident-card";
export type { ArmCardAddress, ArmCardApplicant, ArmCardCasualties, ArmCardFixture } from "./arm-card";
export type { ArmCardId, ArmCardPhones, ArmCardWhat, GeoPoint, NotificationAddedBy } from "./arm-card";
export type { NotificationEntry, ServiceStatusEvent, WorkLine } from "./arm-card";
export type { Difficulty, Etalon, Scenario, ScenarioHints, ScenarioLevel, ScenarioSource } from "./scenario";
export type {
  AIExpectedAction,
  AIFieldDecision,
  AIFieldDecisionInput,
  AIFieldDecisionKind,
  AIScenarioApproveRequest,
  AIScenarioDraftRequest,
  AIScenarioGeneration,
  AIScenarioGeneratorKind,
  AIScenarioReviseRequest,
  AIScenarioVersion,
  AIValidationError,
  AIWorkflowApproval,
  AIWorkflowMode,
  AIWorkflowSourceKind,
  AIWorkflowValidation,
} from "./scenario";
export type { ScenarioTimeNorms, ScenarioValidation, ScenarioValidationStatus } from "./scenario";
export type { SuccessCriteria } from "./scenario";
export type { CardEvent, CardFlowItem, CardSource, CardStatusMark, ErrorSeverity } from "./session";
export type { Evaluation, EvaluationError, GrammarError, GrammarErrorType, PhoneCall } from "./session";
export type { ScenarioMode, Session, SessionFeedEvent, SessionFeedEventKind, SessionState } from "./session";
export type { TeacherOverride, TranscriptLine, TranscriptSpeaker } from "./session";
export type { ChartData, ChartKind, GroupReport, GroupReportCharts, LabeledSeries, Report } from "./report";
export type { ReportCharts, ReportError, ReportExportFormat, ReportGrammarError } from "./report";
export type { ReportStageAttempt, ReportStudent, ReportTimeMetric } from "./report";
export type { EvaluationOverrideRequest, ReportFeedback, ReportFeedbackRequest } from "./report";
export type { ReportJournalFilters, ReportJournalQuery, ReportJournalResponse } from "./report";
export type { ReportJournalRow, ReportJournalStatus, ReportJournalStudent } from "./report";
export type { AuditEventType, AuditLogEntry, AuditLogQuery, SystemIntegrity } from "./admin";
export type { SystemLogEntry, SystemLogLevel, SystemLogsQuery, SystemMonitoring } from "./admin";
export type { SystemService, SystemServiceAction, SystemServiceActionRequest } from "./admin";
export type { SystemServiceState, SystemServicesResponse, SystemSettings } from "./admin";
export type { SystemSettingsPatch, UsageStats, UsageStatsPeriod } from "./admin";
export type { UsageStatsPeriodId, UsageStatsQuery } from "./admin";
export type { GrammarCheckRequest, MaterialFormat, MaterialUploadRequest } from "./teacher";
export type { ProfileMappingRow, ProfileMappingSaveRequest, ScenarioGenerateRequest } from "./teacher";
export type { ScenarioUpdateRequest, TrainingMaterial } from "./teacher";
export type { ApiErrorBody, ApiErrorCode, PageQuery, PageResponse, QueryParams, QueryScalar } from "./api";
export type { QueryValue } from "./api";
export type { CardDetails, CardId, CardLink, CardLinkRole, CardLinksResponse } from "./card-runtime";
export type { CardRecording, CardReminder, CardReminderRequest, CardRuntimeState } from "./card-runtime";
export type { CardSms, CardSmsRequest, CardStatusEvent, CardStatusRequest } from "./card-runtime";
export type { CardWorkLine, CardWorkLineRequest, CardsQuery, SmsDirection } from "./card-runtime";
export type { ChangePasswordRequest, ClassifierQuery, LoginRequest } from "./requests";
export type { ReportsResponse, ScenarioCreateRequest } from "./requests";
export type { ScenarioListQuery, ScenarioValidateAction, ScenarioValidateRequest } from "./requests";
export type { SessionCreateRequest, SessionFeedQuery, SessionFeedResponse } from "./requests";
export type { SessionListQuery, ToggleUserActiveRequest, UserListQuery } from "./requests";
export type { SessionControlAction, SessionControlRequest, SessionControlResponse } from "./requests";
export type { SessionIssueOrder, SessionPlan } from "./requests";
export type { AdminUserActionRequest, AdminUserCreateRequest, AdminUserListQuery } from "./requests";
export type { AdminUserPasswordResetResponse, AdminUserRoleFields, AdminUserState } from "./requests";
export type { AdminUserUpdateRequest } from "./requests";
export type { CardStatusRef, ClassifierNotification, TrainingCard, UserRole } from "./legacy";
export type { CardSearchFilters } from "./card-search";
export type { CallReply, CallReplyRequest, CallTurn, CallVoice, CardCallRequest } from "./calls";
export type { CardCallResponse } from "./calls";
export type {
  AssessmentAxes,
  AssessmentResolveRequest,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  AttemptProgressRequest,
  CardAttemptRequest,
  CardAttemptResponse,
  EvaluationStatus,
  SemanticArbitrationDecision,
  SemanticReviewItem,
} from "./attempts";
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
} from "./errors";
export type {
  Assignment,
  AssignmentCreateRequest,
  AssignmentDetail,
  AssignmentFormat,
  AssignmentHints,
  AssignmentLinkState,
} from "./assignments";
export type {
  AssignmentListQuery,
  AssignmentNorms,
  AssignmentParams,
  AssignmentProgress,
} from "./assignments";
export type {
  AssignmentRandomRule,
  AssignmentState,
  ChainReview,
  ChainSubmitReview,
  StartAssignmentResult,
} from "./assignments";
export type { TrainingMode } from "./assignments";
export type { AssignmentScenarioVersion } from "./assignments";
export type { Ticket, TicketOrigin, TicketsQuery } from "./tickets";
export type { GroupInsight, GroupInsights, StudentProfile, TypicalError } from "./lobby";
export type { Analytics, AnalyticsDynamics, AnalyticsTopError, HistoryItem, HistoryQuery } from "./lobby";
export type { LobbyMode, Recommendation, RecommendationKind, RecommendationReason, Stats } from "./lobby";
export type { KbArticle, KbArticlePatch, KbArticlesQuery, KbSections } from "./kb";
export type { ReportAudioResponse, ReportCall, ReportCheck, ReportCheckResult } from "./work-messages";
export type { ReportTranscriptLine, WorkMessage, WorkMessageKind, WorkMessageStatus } from "./work-messages";
export type {
  AddressSource,
  CardDraft,
  CardDraftAddress,
  CardDraftApplicant,
  CardDraftCasualties,
} from "./operator112";
export type {
  CardDraftEmergency,
  CardDraftNotification,
  CardDraftPhones,
  CardDraftWhat,
} from "./operator112";
export type {
  FieldDiff,
  NotificationAdder,
  NotificationListItem,
  NotificationListPreview,
} from "./operator112";
export type {
  NotificationListResponse,
  OperatorAttempt,
  OperatorAttemptState,
  OperatorEvaluation,
} from "./operator112";
export type {
  OperatorEvent,
  OperatorEventKind,
  OperatorEventRequest,
  OperatorEventType,
} from "./operator112";
export type { OperatorHintStep } from "./operator112";
export type { OperatorHints, Street, TicketAudio, TicketAudioStatus } from "./operator112";
export type { HealthStatus } from "./health";
