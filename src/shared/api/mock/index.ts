/*
 * Серверный мок-слой (только для route handlers app/api/mock/** и логики/тестов src/shared/api/mock/**).
 * НЕ импортировать из клиентского кода и слоёв выше shared: для них — клиент "@/shared/api".
 */
export { readArmFixtures, readAuditLog, readCards, readClassifier, readClassifierMeta } from "./readers";
export { readGroupReport, readReference, readReports, readScenarios, readSessions } from "./readers";
export { readUsers } from "./readers";
export { issueSessionToken, readRequestSession, verifySessionToken } from "./auth-tokens";
export { buildSessionCookie, buildSessionToken, ensureTestStudent } from "./session-cookie";
export type { VerifiedSession } from "./auth-tokens";
export { badRequest, conflict, forbidden, HTTP_STATUS, jsonCreated, jsonError, jsonOk } from "./respond";
export { MockApiError, notFound, toErrorResponse, unauthorized, validationFailed } from "./respond";
export { withErrorHandling } from "./respond";
export type { HttpStatus } from "./respond";
export { DEFAULT_PER_PAGE, isRecord, readIntParam, readJsonBody, readListParam } from "./request";
export { readPageParams, readSearchParams, readStringParam } from "./request";
export type { RouteContext } from "./request";
export { nowIso, parseIso, toMoscowIso } from "./time";
export { cloneOut, getMockState, MOCK_ID_PREFIX, nextMockId, resetMockStore } from "./store";
export type { MockIdPrefix, MockStoreState } from "./store";
export {
  addCardReminder,
  addCardSms,
  addCardStatusEvent,
  addCardWorkLine,
  readCardRuntime,
} from "./store-cards";
export type { CardSmsInput } from "./store-cards";
export { addAttemptCall, addAttemptStatus, findStoredAttempt, findStoredScenario } from "./store-training";
export {
  findStoredSession,
  insertStoredScenario,
  insertStoredSession,
  listStoredScenarios,
} from "./store-training";
export { listStoredSessions, setAttemptEnteredText, updateStoredAttempt } from "./store-training";
export { updateStoredScenario, updateStoredSession } from "./store-training";
export {
  appendAuditEntry,
  findStoredUser,
  listAuditLog,
  listStoredUsers,
  listSystemServices,
} from "./store-admin";
export { readSystemSettings, toPublicUser, updateStoredUser, updateSystemService } from "./store-admin";
export { updateSystemSettings } from "./store-admin";
export type { AuditEntryInput } from "./store-admin";
export { SEED_SYSTEM_SERVICES, SEED_SYSTEM_SETTINGS } from "./store-seed";
export { appendSystemLog, listSystemLogs, readSystemIntegrity } from "./store-system";
export { updateSystemIntegrity } from "./store-system";
export type { SystemLogInput } from "./store-system";
export { getMonitoring, getSystemIntegrity, getSystemLogs, getSystemServices } from "./system";
export { getSystemSettings, getUsageStats, hasRunningSession } from "./system";
export { patchSystemSettings, runServiceAction, SESSION_LOCK_MESSAGE } from "./system";
export { queryAuditLog } from "./system-audit";
export { readMonitoringMock, readSystemIntegrityMock, readSystemLogsMock } from "./readers-system";
export { readSystemServicesMock, readSystemSettingsMock, readUsageStatsMock } from "./readers-system";
export { insertStoredMaterial, listStoredMaterials, listStoredProfileMapping } from "./store-teacher";
export { saveStoredProfileMapping } from "./store-teacher";
export { auditTeacherAction, listMaterials, listProfileMapping, listTrainingCards } from "./teacher";
export { requireTeacher, resolveMaterialFormat, saveProfileMapping, uploadMaterial } from "./teacher";
export { getScenarioDeleteBlock, SCENARIO_DELETE_BLOCK_MESSAGES, toLevel } from "./scenarios";
export type { ScenarioDeleteBlock } from "./scenarios";
export { getReferenceData } from "./reference";
export { DEFAULT_FIXTURE_ID, resolveArmFixture, resolveArmFixtureId } from "./fixture-map";
export { ensureSessionReport, ensureStudentReports, hasStaticReports } from "./reports-runtime";
export { runtimeGroupReportId, runtimeReportId } from "./reports-runtime";
export type { RuntimeReportDeps, RuntimeTimeNorms } from "./reports-runtime";
export { findStoredGroupReport, findStoredReport, listStoredFeedback } from "./store-reports";
export { listStoredReports, listStoredSessionReports } from "./store-reports";
export { assertOwnAttempt, isStudentViewer, resolveStudentScope } from "./viewer";
export type { MockViewer, ViewerResolver } from "./viewer";
