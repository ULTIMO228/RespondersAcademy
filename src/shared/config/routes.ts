/* Карта роутов приложения (spec/000-фронт/03-architecture.md «Карта роутов»). */
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
