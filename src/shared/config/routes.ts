/* Карта роутов приложения (spec/03-architecture.md «Карта роутов»). */
export const ROUTES = {
  login: "/login",
  /** Страница 403 «Доступ запрещён» (гварды ролей, spec/02-roles.md). */
  forbidden: "/forbidden",
  arm: "/arm",
  armCard: (cardId: string) => `/arm/card/${cardId}`,
  armPhone: "/arm/phone",
  /** Софтфон из карточки: подсказка ожидаемого номера и запись вызова в CardEvent.calls попытки. */
  armPhoneForCard: (cardId: string) => `/arm/phone?cardId=${encodeURIComponent(cardId)}`,
  armProgress: "/arm/progress",
  armHelp: "/arm/help",
  teacher: "/teacher",
  teacherMonitor: (studentId: string) => `/teacher/monitor/${studentId}`,
  teacherScenarios: "/teacher/scenarios",
  teacherScenario: (scenarioId: string) => `/teacher/scenarios/${scenarioId}`,
  teacherSession: "/teacher/session",
  /** Мастер занятия с предвыбранным сценарием — кнопка «в занятие» списка сценариев (T3.1-03). */
  teacherSessionForScenario: (scenarioId: string) =>
    `/teacher/session?scenarioId=${encodeURIComponent(scenarioId)}`,
  teacherReports: "/teacher/reports",
  teacherReport: (sessionId: string) => `/teacher/reports/${sessionId}`,
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
