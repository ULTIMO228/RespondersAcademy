/*
 * Контракты запросов/ответов эндпоинтов auth, classifier, scenarios, sessions, reports, admin.
 * Query-типы — type-алиасы (не interface), чтобы подходить под QueryParams клиента.
 */
import type { GroupReport, Report } from "./report";
import type {
  Difficulty,
  Scenario,
  ScenarioSource,
  ScenarioTimeNorms,
  ScenarioValidationStatus,
} from "./scenario";
import type {
  CardFlowItem,
  CardSource,
  ScenarioMode,
  Session,
  SessionFeedEvent,
  SessionState,
} from "./session";
import type { PublicUser, Role } from "./user";

/** POST /api/mock/auth/login. */
export interface LoginRequest {
  login: string;
  password: string;
  armNumber: number;
}

/**
 * GET /api/mock/classifier?group= → ClassifierEntry[] (без group — все 1283 записи).
 * code — записи группы, к которой относится код ЕКП (опросная карта карточки по what.classifierCode).
 */
export type ClassifierQuery = {
  group?: string;
  code?: string;
};

/** GET /api/mock/scenarios — фильтры списка преподавателя (множественные — повторными ключами). */
export type ScenarioListQuery = {
  group?: readonly string[];
  difficulty?: readonly Difficulty[];
  source?: ScenarioSource;
  validationStatus?: ScenarioValidationStatus;
};

/** POST /api/mock/scenarios — черновик (validation.status = draft выставляет мок-слой). */
export type ScenarioCreateRequest = Omit<Scenario, "id" | "validation">;

/**
 * approve / approvePartial / reject — решение по сценарию на проверке (pending → approved | rejected);
 * submit — [расширение мок-слоя] отправка на проверку/коррекцию (draft | rejected | approved → pending,
 * 11-teacher-scenarios.md «Коррекция»: сценарий уходит в pending с записью комментария).
 */
export type ScenarioValidateAction = "approve" | "approvePartial" | "reject" | "submit";

/** POST /api/mock/scenarios/[id]/validate */
export interface ScenarioValidateRequest {
  action: ScenarioValidateAction;
  /** Для approvePartial — выбранные поля. */
  fields?: string[];
  comment?: string;
  /** userId преподавателя. */
  reviewedBy: string;
}

/**
 * GET /api/mock/users — состав учебных групп для мастера занятия и мониторинга (T3.2-03).
 * Доступен преподавателю и администратору; обучающемуся — 403 (ТЗ §8).
 */
export type UserListQuery = {
  role?: Role;
  group?: string;
};

/** GET /api/mock/sessions */
export type SessionListQuery = {
  teacherId?: string;
  studentId?: string;
  state?: SessionState;
};

/** Порядок выдачи сценариев (шаг 4 мастера): ручная перестановка или адаптивная сложность (Q&A в10). */
export type SessionIssueOrder = "manual" | "adaptive";

/**
 * Настройки мастера занятия, по которым мок-слой строит расписание выдачи (T3.2-02, T3.2-09).
 * В контракте `Session` этих полей нет (spec/000-фронт/05-data-models.md §7) — план хранит мок-слой рядом с занятием
 * и отдаёт через `GET /api/mock/sessions/[id]/control`.
 */
export interface SessionPlan {
  /** Группы ЕКП занятия (шаг 2); пустой список — без фильтра по категориям. */
  categories: string[];
  /** Порядок выдачи (шаг 4); дефолт — adaptive. */
  issueOrder: SessionIssueOrder;
  /** Тумблер «Подсказки» (шаг 5, Scenario.hints). */
  hints: boolean;
  /** Нормативы занятия, сек (шаг 6): два раздельных норматива 30 / 180. */
  timeNorms: ScenarioTimeNorms;
  /** Порог грамматических ошибок (шаг 6, SuccessCriteria.maxGrammarErrors). */
  maxGrammarErrors: number;
  /** Темп выдачи: новая карточка через N сек после предыдущей (шаг 7, многозадачность Q&A в6). */
  paceSec: number;
  /** Бесконечный конвейер до ручной остановки (сценарий В). */
  conveyor: boolean;
}

/** POST /api/mock/sessions — мастер преподавателя; scenarioIds — только approved. */
export interface SessionCreateRequest {
  teacherId: string;
  studentIds: string[];
  scenarioIds: string[];
  mode: ScenarioMode;
  cardSource: CardSource;
  cardFlow?: CardFlowItem[];
  timeNorms?: ScenarioTimeNorms;
  /** Настройки мастера; без них start строит расписание по умолчанию (шаг 3 мин). */
  plan?: SessionPlan;
}

/** Действия управления занятием (spec/000-фронт/04-pages/12 «Управление во время занятия»). */
export type SessionControlAction = "pause" | "resume" | "issue" | "report";

/** POST /api/mock/sessions/[id]/control — пауза выдачи, внеочередная карточка, отчёт. */
export interface SessionControlRequest {
  action: SessionControlAction;
  /** Для issue — кому выдать карточку. */
  studentId?: string;
  /** Для issue — конкретная карточка; без неё мок-слой берёт следующую из пула занятия. */
  cardId?: string;
}

/** GET/POST /api/mock/sessions/[id]/control — занятие + состояние выдачи. */
export interface SessionControlResponse {
  session: Session;
  /** Настройки мастера; null — занятие создано без плана (например, курсантом по модулю). */
  plan: SessionPlan | null;
  /** Выдача новых карточек приостановлена. */
  paused: boolean;
  /** Момент паузы (ISO +03:00) или null. */
  pausedAt: string | null;
  /** Карточек в расписании, ещё не выданных (включая отложенные паузой). */
  pendingCount: number;
}

/** GET /api/mock/sessions/[id]/feed — окно событий (since, at]; at по умолчанию — серверное «сейчас». */
export type SessionFeedQuery = {
  since?: string;
  at?: string;
  /** Только события одного курсанта (экран монитора преподавателя, T3.3-07). */
  studentId?: string;
};

export interface SessionFeedResponse {
  sessionId: string;
  /** Фактическая правая граница окна (для следующего since). */
  at: string;
  events: SessionFeedEvent[];
}

/** GET /api/mock/reports?sessionId= */
export interface ReportsResponse {
  reports: Report[];
  groupReport: GroupReport | null;
}

/** POST /api/mock/admin/users/[id]/toggle-active — adminId пишется в аудит. */
export interface ToggleUserActiveRequest {
  adminId: string;
}

/* ── Реестр пользователей администратора (T4.1-02…T4.1-04, 04-pages/20-admin-users.md) ── */

/** Состояние учётной записи в фильтре реестра: `User.isActive` true | false. */
export type AdminUserState = "active" | "blocked";

/** GET /api/mock/admin/users — фильтры реестра и поиск по ФИО/логину. */
export type AdminUserListQuery = {
  role?: Role;
  state?: AdminUserState;
  group?: string;
  /** Подстрока ФИО или логина, регистронезависимо. */
  q?: string;
};

/** Ролевые поля учётной записи: группа обучающегося, служба, закреплённые группы преподавателя. */
export interface AdminUserRoleFields {
  group?: string;
  service?: string;
  /** [app-расширение] закреплённые группы преподавателя (расхождение №5). */
  assignedGroups?: string[];
}

/** POST /api/mock/admin/users — создание учётной записи (id `u-NNN` выдаёт мок-слой). */
export interface AdminUserCreateRequest extends AdminUserRoleFields {
  adminId: string;
  fullName: string;
  login: string;
  /** Временный пароль: в моке хранится как есть, наружу не отдаётся. */
  password: string;
  role: Role;
  armNumber: number;
}

/**
 * PATCH /api/mock/admin/users/[id] — редактирование. `role` — отдельное действие «смена роли»:
 * пишет собственное событие аудита и приводит ролевые поля к правилам новой роли.
 */
export interface AdminUserUpdateRequest extends AdminUserRoleFields {
  adminId: string;
  fullName?: string;
  login?: string;
  armNumber?: number;
  role?: Role;
}

/** POST /api/mock/admin/users/[id]/block | /unblock | /reset-password — автор действия для аудита. */
export interface AdminUserActionRequest {
  adminId: string;
}

/** POST /api/mock/admin/users/[id]/reset-password — временный пароль показывается администратору. */
export interface AdminUserPasswordResetResponse {
  user: PublicUser;
  temporaryPassword: string;
}
