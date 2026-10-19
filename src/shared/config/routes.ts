/* Карта роутов приложения (spec/000-фронт/03-architecture.md «Карта роутов»). */

const TEACHER_ASSIGNMENT_NEW = "/teacher/assignments/new";

/**
 * Имена query-параметров мастера назначения при переходе из карты ошибок (спека 003, US2). Собирает
 * `ROUTES.teacherAssignmentNewPrefilled`, разбирает `assignmentPrefillFromQuery` (features/assignment-create).
 */
export const ASSIGNMENT_NEW_QUERY = {
  studentIds: "studentIds",
  mode: "mode",
  title: "title",
  focusStage: "focusStage",
} as const;

export const ROUTES = {
  login: "/login",
  /** Страница 403 «Доступ запрещён» (гварды ролей, spec/000-фронт/02-roles.md). */
  forbidden: "/forbidden",
  arm: "/arm",
  armCard: (cardId: string) => `/arm/card/${cardId}`,
  armPhone: "/arm/phone",
  /** Софтфон из карточки: подсказка ожидаемого номера и запись вызова в CardEvent.calls попытки. */
  armPhoneForCard: (cardId: string) => `/arm/phone?cardId=${encodeURIComponent(cardId)}`,
  /** Рабочее место режима «Специалист-112» (спека 002): попытка выдаётся по заданию, без assignmentId экран поясняет, откуда открыть. */
  armOperator112: "/arm/operator112",
  armOperator112ForAssignment: (assignmentId: string) =>
    `/arm/operator112?assignmentId=${encodeURIComponent(assignmentId)}`,
  /**
   * Мастер назначения, предзаполненный из карты ошибок (спека 003, US2). Пустые поля в ссылку не попадают.
   * В `title` и `focusStage` передаётся отображаемое название этапа: словарь этапов живёт только на бэкенде.
   */
  teacherAssignmentNewPrefilled: (prefill: {
    studentIds?: string[];
    mode?: string;
    title?: string;
    focusStage?: string;
  }): string => {
    const query = new URLSearchParams();
    if (prefill.studentIds && prefill.studentIds.length > 0) {
      query.set(ASSIGNMENT_NEW_QUERY.studentIds, prefill.studentIds.join(","));
    }
    if (prefill.mode) query.set(ASSIGNMENT_NEW_QUERY.mode, prefill.mode);
    if (prefill.title) query.set(ASSIGNMENT_NEW_QUERY.title, prefill.title);
    if (prefill.focusStage) query.set(ASSIGNMENT_NEW_QUERY.focusStage, prefill.focusStage);
    const search = query.toString();
    return search ? `${TEACHER_ASSIGNMENT_NEW}?${search}` : TEACHER_ASSIGNMENT_NEW;
  },
  /** Задания обучающегося (спека 002, T017). */
  studentAssignments: "/student/assignments",
  /** Прежние вкладки симулятора: редиректы в платформу (next.config.ts). */
  armProgress: "/arm/progress",
  armHelp: "/arm/help",
  /** Кабинет обучающегося (платформа, спека 002 часть B). */
  studentHome: "/student",
  studentResults: "/student/results",
  studentResult: (attemptId: string, mode: string) =>
    `/student/results/${encodeURIComponent(attemptId)}?mode=${encodeURIComponent(mode)}`,
  studentAnalytics: "/student/analytics",
  /** Справочник (все роли): статьи, номера, памятки, клавиши, статусы. */
  reference: "/reference",
  referenceSearch: (query: string) => `/reference?q=${encodeURIComponent(query)}`,
  referenceArticle: (articleId: string) => `/reference?article=${encodeURIComponent(articleId)}`,
  /** Профиль и безопасность (все роли). */
  account: "/account",
  accountSecurity: "/account/security",
  teacher: "/teacher",
  teacherMonitor: (studentId: string) => `/teacher/monitor/${studentId}`,
  teacherScenarios: "/teacher/scenarios",
  teacherScenario: (scenarioId: string) => `/teacher/scenarios/${scenarioId}`,
  /** Визуальный конструктор сценариев (фича 005, прототип без сервера): рабочее место во весь экран. */
  teacherConstructor: "/teacher/constructor",
  teacherSession: "/teacher/session",
  /** Мастер занятия с предвыбранным сценарием — кнопка «в занятие» списка сценариев (T3.1-03). */
  teacherSessionForScenario: (scenarioId: string) =>
    `/teacher/session?scenarioId=${encodeURIComponent(scenarioId)}`,
  teacherAssignments: "/teacher/assignments",
  teacherAssignmentNew: "/teacher/assignments/new",
  teacherAssignment: (assignmentId: string) => `/teacher/assignments/${encodeURIComponent(assignmentId)}`,
  teacherStudents: "/teacher/students",
  teacherStudent: (studentId: string) => `/teacher/students/${encodeURIComponent(studentId)}`,
  teacherGroup: (groupId: string) => `/teacher/groups/${encodeURIComponent(groupId)}`,
  teacherReports: "/teacher/reports",
  teacherReport: (sessionId: string) => `/teacher/reports/${sessionId}`,
  /** Карта ошибок (спека 003): фильтры периода, режима и этапа — в query текущего экрана, хелперы их не собирают. */
  teacherErrorMap: "/teacher/error-map",
  teacherErrorMapGroup: (groupId: string) => `/teacher/error-map/${encodeURIComponent(groupId)}`,
  teacherErrorMapJournal: (groupId: string) => `/teacher/error-map/${encodeURIComponent(groupId)}/journal`,
  teacherErrorMapStudent: (studentId: string) =>
    `/teacher/error-map/students/${encodeURIComponent(studentId)}`,
  teacherErrorMapPresent: (groupId: string) => `/teacher/error-map/${encodeURIComponent(groupId)}/present`,
  adminHome: "/admin",
  adminAudit: "/admin/audit",
  adminSecurity: "/admin/security",
  adminUsers: "/admin/users",
  adminSystem: "/admin/system",
  dev: "/dev",
  devUi: "/dev/ui",
} as const;

/* Демо-учётки прототипа (волна 0 без авторизации): обучающийся, преподаватель, администратор. */
export const DEMO_USER_IDS = {
  student: "u-005",
  teacher: "u-002",
  admin: "u-001",
} as const;
